// Vue d'un compte : sa page, ses règles de navigation, ses fenêtres d'appel, sa reprise après une panne.
const { BrowserWindow, WebContentsView, shell } = require('electron');
const path = require('node:path');
const policy = require('./policy');
const { UnreadTracker } = require('./unread');
const { setupSession } = require('./sessions');
const { attachContextMenu } = require('./context-menu');

const APP_ICON = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const PROBE_WORLD = 1001; // monde isolé où tournent les lectures de page du catalogue
const PROBE_INTERVAL = 4000;
const OFFLINE_RETRY = [5, 15, 60, 300]; // secondes, puis toutes les 5 min
const CRASH_RETRY = [2, 10, 60];
const CRASH_WINDOW = 10 * 60e3;
const STAGGER_MAX_WAIT = 4000;

// État vivant d'un compte, affiché dans la barre latérale et la fenêtre Diagnostic.
function createRuntime(view) {
  const popups = new Set();
  return {
    status: 'waiting', // waiting, loading, ready, offline, crashed, unresponsive
    unresponsive: false,
    loggedOut: false,
    unread: { count: null, dot: false, source: null },
    tracker: null,
    title: '',
    favicons: [],
    probe: null, // { at, result | error }
    url: '',
    loadedAt: 0,
    retryAt: null,
    retryTimer: null,
    retryCount: 0,
    crashes: [],
    error: null,
    stats: { page: 0, fallback: 0, suppressed: 0, lastAt: null },
    lastPageNotificationAt: 0,
    wcIds: new Set([view.webContents.id]),
    popups,
    webContents: () => [view.webContents, ...[...popups].map((win) => win.webContents)].filter((wc) => wc && !wc.isDestroyed()),
  };
}

function displayStatus(rt) {
  if (!rt) return 'waiting';
  if (rt.status === 'ready' && rt.unresponsive) return 'unresponsive';
  if (rt.status === 'ready' && rt.loggedOut) return 'login';
  return rt.status;
}

const userAgentFor = (hub, account) => (account.userAgent === 'electron' ? hub.userAgents.electron : hub.userAgents.chrome);

function create(hub, account) {
  const id = account.id;
  const getService = () => hub.account(id)?.service ?? account.service;
  const ses = setupSession({ accountId: id, getService, getWindow: () => hub.win, userAgent: userAgentFor(hub, account), log: hub.log });
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegrationInSubFrames: true, // le préchargement tourne aussi dans les iframes (sans accès Node pour autant)
      focusOnNavigation: false, // sinon une vue masquée qui recharge vole le clavier (Electron 44)
      safeDialogs: true,
      spellcheck: true,
    },
  });
  view.setBackgroundColor('#13151a');
  view.setVisible(false);
  hub.win.contentView.addChildView(view);
  hub.views.set(id, view);

  const wc = view.webContents;
  const rt = createRuntime(view);
  rt.tracker = new UnreadTracker(account.service.unread, (next, previous) => hub.onUnreadChange(id, next, previous));
  hub.runtime.set(id, rt);

  const update = (patch) => {
    if (hub.quitting || !hub.rt(id)) return;
    Object.assign(rt, patch);
    hub.updateViews();
    hub.pushState();
  };

  wc.on('page-title-updated', (_event, title) => {
    rt.title = title;
    rt.tracker.setTitle(title);
    scheduleProbe(hub, id, 500);
  });
  wc.on('page-favicon-updated', (_event, favicons) => {
    rt.favicons = favicons;
    rt.tracker.setFavicons(favicons);
    scheduleProbe(hub, id, 500);
  });

  wc.on('did-start-loading', () => {
    if (rt.status === 'waiting' || rt.status === 'offline' || rt.status === 'crashed') update({ status: 'loading' });
  });
  wc.on('did-start-navigation', (event) => {
    if (event.isMainFrame && !event.isSameDocument) rt.failedLoad = false;
  });
  wc.on('did-finish-load', () => {
    // Après un échec, Electron émet aussi did-finish-load pour la page d'erreur : ce n'est pas un succès.
    if (rt.failedLoad) return;
    clearTimeout(rt.retryTimer);
    // Le zoom ne tient qu'une fois la page chargée (Chromium le range par domaine) : on le remet à chaque chargement.
    const zoomLevel = hub.account(id)?.zoom ?? 0;
    if (wc.getZoomLevel() !== zoomLevel) wc.setZoomLevel(zoomLevel);
    update({ status: 'ready', unresponsive: false, loadedAt: Date.now(), retryAt: null, retryCount: 0, error: null, url: wc.getURL(), loggedOut: isLoggedOut(getService(), wc.getURL()) });
    scheduleProbe(hub, id, 1500);
  });
  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 : navigation annulée (redirection, nouvelle page…)
    rt.failedLoad = true;
    hub.log('warn', `${id} : échec de chargement ${errorCode} ${errorDescription}`);
    rt.tracker.reset();
    rt.unread = { count: null, dot: false, source: null };
    update({ status: 'offline', error: errorDescription || `Erreur ${errorCode}` });
    scheduleRetry(hub, id, OFFLINE_RETRY, () => load(hub, id, validatedURL || getService().url));
  });
  const onNavigate = (url) => {
    rt.url = url;
    const loggedOut = isLoggedOut(getService(), url);
    if (loggedOut !== rt.loggedOut) {
      if (loggedOut) hub.log('info', `${id} : connexion requise`);
      update({ loggedOut });
    }
  };
  wc.on('did-navigate', (_event, url) => onNavigate(url));
  wc.on('did-navigate-in-page', (_event, url, isMainFrame) => isMainFrame && onNavigate(url));

  wc.on('render-process-gone', (_event, details) => {
    if (hub.quitting) return;
    hub.log('error', `${id} : page arrêtée (${details.reason}, code ${details.exitCode})`);
    rt.tracker.reset();
    rt.unread = { count: null, dot: false, source: null };
    const now = Date.now();
    rt.crashes = [...rt.crashes.filter((at) => now - at < CRASH_WINDOW), now];
    update({ status: 'crashed', unresponsive: false, error: `Arrêt de la page (${details.reason})` });
    // Plus de 3 plantages en 10 min : on arrête de relancer seul, l'utilisateur décidera.
    if (rt.crashes.length <= CRASH_RETRY.length) scheduleRetry(hub, id, CRASH_RETRY, () => wc.reload(), rt.crashes.length - 1);
  });
  wc.on('unresponsive', () => {
    hub.log('warn', `${id} : la page ne répond plus`);
    update({ unresponsive: true });
  });
  wc.on('responsive', () => update({ unresponsive: false }));

  wc.on('dom-ready', () => {
    const css = getService().css;
    if (css) wc.insertCSS(css).catch(() => {});
  });
  wc.on('enter-html-full-screen', () => hub.setFullscreenAccount(id));
  wc.on('leave-html-full-screen', () => hub.setFullscreenAccount(null));
  wc.on('audio-state-changed', () => hub.updateAudio(id));
  wc.on('zoom-changed', (_event, direction) => zoom(hub, id, direction === 'in' ? 1 : -1));
  wc.on('before-input-event', (event, input) => hub.handleShortcut(event, input));

  guardNavigation(hub, wc, getService);
  attachContextMenu(wc, () => hub.win);
  wc.setWindowOpenHandler((details) => openWindow(hub, id, getService, details));
  wc.on('did-create-window', (child, details) => adoptWindow(hub, id, getService, child, details));
  return view;
}

function isLoggedOut(service, url) {
  return Boolean(service.loggedOut?.test(url));
}

// Navigation de la page principale : les domaines du service restent dans l'app, le reste part dans le navigateur.
// will-navigate couvre les liens et formulaires, will-redirect les redirections du serveur.
function guardNavigation(hub, wc, getService) {
  const check = (event) => {
    if (!event.isMainFrame) return;
    const decision = policy.navigationDecision(getService(), event.url);
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision.rewrite) {
      wc.loadURL(decision.rewrite).catch(() => {});
    } else if (decision === 'external') {
      openExternal(hub, event.url);
    } else {
      hub.log('info', `navigation bloquée : ${shortUrl(event.url)}`);
    }
  };
  wc.on('will-navigate', check);
  wc.on('will-redirect', check);
}

function openExternal(hub, url) {
  const target = policy.unwrapLink(url);
  if (!policy.canOpenExternally(target)) return;
  shell.openExternal(target).catch((error) => hub.log('warn', `ouverture externe impossible : ${error.message}`));
}

const shortUrl = (url) => {
  try {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname.slice(0, 60)}`;
  } catch {
    return String(url).slice(0, 80);
  }
};

// window.open : appels et connexion dans une fenêtre de l'app (même session), liens dans le navigateur.
function openWindow(hub, id, getService, { url }) {
  const decision = policy.popupDecision(getService(), url);
  if (decision === 'external') openExternal(hub, url);
  if (decision !== 'window' && decision !== 'blank') return { action: 'deny' };
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 1000,
      height: 760,
      show: decision === 'window', // about:blank : on attend de savoir ce que la page y charge
      autoHideMenuBar: true,
      icon: APP_ICON,
      backgroundColor: '#13151a',
      webPreferences: { sandbox: true, contextIsolation: true, focusOnNavigation: true, safeDialogs: true },
    },
  };
}

function adoptWindow(hub, id, getService, child) {
  const rt = hub.rt(id);
  if (!rt) return child.destroy();
  const wc = child.webContents;
  child.removeMenu();
  rt.popups.add(child);
  rt.wcIds.add(wc.id);
  child.on('closed', () => {
    rt.popups.delete(child);
    rt.wcIds.delete(wc.id);
  });
  // Fenêtre about:blank remplie ensuite par la page : on la garde si c'est un appel, sinon navigateur.
  if (child.isVisible()) {
    guardNavigation(hub, wc, getService);
  } else {
    let decided = false;
    const decide = (url, event) => {
      if (decided || child.isDestroyed() || !url || url === 'about:blank') return;
      decided = true;
      if (policy.popupDecision(getService(), url) === 'window') {
        guardNavigation(hub, wc, getService);
        return child.show();
      }
      event?.preventDefault();
      openExternal(hub, url);
      child.destroy();
    };
    wc.on('will-navigate', (event) => decide(event.url, event));
    wc.on('did-navigate', (_event, url) => decide(url));
    setTimeout(() => !decided && !child.isDestroyed() && child.destroy(), 15e3);
  }
  attachContextMenu(wc, () => child);
  wc.setWindowOpenHandler((details) => openWindow(hub, id, getService, details));
  wc.on('did-create-window', (grandChild, details) => adoptWindow(hub, id, getService, grandChild, details));
}

// ---------------------------------------------------------------- chargement

function load(hub, id, url) {
  const view = hub.views.get(id);
  const rt = hub.rt(id);
  if (!view || !rt || view.webContents.isDestroyed()) return;
  clearTimeout(rt.retryTimer);
  rt.retryAt = null;
  // Une page déjà affichée le reste pendant le rechargement : si la navigation est annulée (beforeunload,
  // redirection bloquée), aucun événement ne viendrait la sortir de « chargement ».
  if (rt.status !== 'ready') rt.status = 'loading';
  view.webContents.loadURL(url ?? hub.account(id).service.url).catch(() => {}); // les échecs passent par did-fail-load
  hub.updateViews();
  hub.pushState();
}

function scheduleRetry(hub, id, delays, retry, attempt) {
  const rt = hub.rt(id);
  if (!rt) return;
  clearTimeout(rt.retryTimer);
  const index = attempt ?? rt.retryCount;
  rt.retryCount = index + 1;
  const delay = delays[Math.min(index, delays.length - 1)] * 1000;
  rt.retryAt = Date.now() + delay;
  rt.retryTimer = setTimeout(() => {
    rt.retryAt = null;
    if (!hub.quitting && hub.rt(id)) retry();
  }, delay);
}

// Au démarrage : le compte affiché d'abord, puis les autres l'un après l'autre (moins de pic au démarrage du PC).
function startLoading(hub) {
  hub.loadQueue = hub.accounts.map((account) => account.id).sort((a, b) => (b === hub.prefs.activeId) - (a === hub.prefs.activeId));
  loadNext(hub);
}

function loadNext(hub) {
  const id = hub.loadQueue?.shift();
  if (!id) return;
  const wc = hub.views.get(id)?.webContents;
  if (!wc || hub.rt(id)?.status !== 'waiting') return loadNext(hub);
  let done = false;
  const next = () => {
    if (done) return;
    done = true;
    wc.off('did-stop-loading', next);
    wc.off('did-fail-load', next);
    loadNext(hub);
  };
  wc.once('did-stop-loading', next);
  wc.once('did-fail-load', next);
  setTimeout(next, STAGGER_MAX_WAIT);
  load(hub, id);
}

// Compte choisi avant son tour : on le charge tout de suite. Compte ajouté après le démarrage : idem.
function ensureLoaded(hub, id) {
  if (hub.rt(id)?.status !== 'waiting' || !hub.loadQueue) return;
  hub.loadQueue = hub.loadQueue.filter((queued) => queued !== id);
  load(hub, id);
}

function reload(hub, id) {
  const rt = hub.rt(id);
  const wc = hub.views.get(id)?.webContents;
  if (!rt || !wc || wc.isDestroyed()) return;
  rt.crashes = [];
  if (rt.status === 'waiting' || !wc.getURL()) return load(hub, id);
  rt.retryCount = 0;
  wc.reload();
}

function home(hub, id) {
  load(hub, id, hub.account(id)?.service.url);
}

// Remet en route une page bloquée (ex. WhatsApp qui charge sans fin) : vide ses service workers et ses caches,
// sans toucher à la connexion.
async function repair(hub, id) {
  const wc = hub.views.get(id)?.webContents;
  if (!wc || wc.isDestroyed()) return;
  await Promise.allSettled([wc.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }), wc.session.clearCache()]);
  hub.log('info', `${id} : cache vidé`);
  home(hub, id);
}

function toggleCompat(hub, id) {
  const account = hub.account(id);
  const wc = hub.views.get(id)?.webContents;
  if (!account || !wc) return;
  hub.updateStored(id, { userAgent: account.userAgent === 'electron' ? undefined : 'electron' });
  const ua = userAgentFor(hub, hub.account(id));
  wc.session.setUserAgent(ua);
  wc.setUserAgent(ua);
  hub.log('info', `${id} : mode compatibilité ${hub.account(id).userAgent === 'electron' ? 'activé' : 'désactivé'}`);
  home(hub, id);
}

// delta : +1, -1, ou 0 pour revenir à 100 %. Mémorisé par compte.
function zoom(hub, id, delta) {
  const account = hub.account(id);
  const wc = hub.views.get(id)?.webContents;
  if (!account || !wc || wc.isDestroyed()) return;
  const level = delta === 0 ? 0 : Math.max(-5, Math.min(5, (account.zoom ?? 0) + delta * 0.5));
  wc.setZoomLevel(level);
  hub.updateStored(id, { zoom: level || undefined });
}

function destroy(hub, id) {
  const view = hub.views.get(id);
  const rt = hub.rt(id);
  if (rt) {
    clearTimeout(rt.retryTimer);
    rt.tracker.reset();
    for (const popup of rt.popups) if (!popup.isDestroyed()) popup.destroy();
  }
  hub.views.delete(id);
  hub.runtime.delete(id);
  if (!view) return;
  hub.win.contentView.removeChildView(view);
  if (!view.webContents.isDestroyed()) view.webContents.close();
}

// ---------------------------------------------------------------- lecture des pages (catalogue `unread.page`)

function probeCode(service) {
  return `(${service.unread.page.toString()})()`;
}

async function probe(hub, id) {
  const account = hub.account(id);
  const rt = hub.rt(id);
  const wc = hub.views.get(id)?.webContents;
  if (!account?.service.unread?.page || !rt || !wc || wc.isDestroyed() || !['ready'].includes(rt.status)) return;
  try {
    const result = await wc.executeJavaScriptInIsolatedWorld(PROBE_WORLD, [{ code: probeCode(account.service) }]);
    rt.probe = { at: Date.now(), result };
    rt.tracker.setPage(result);
  } catch (error) {
    rt.probe = { at: Date.now(), error: error.message };
  }
}

function scheduleProbe(hub, id, delay) {
  const rt = hub.rt(id);
  if (!rt || !hub.account(id)?.service.unread?.page) return;
  clearTimeout(rt.probeTimer);
  rt.probeTimer = setTimeout(() => probe(hub, id), delay);
}

// Une seule minuterie pour tous les comptes ; elle tourne dans le process principal, que les pages masquées
// ne ralentissent pas.
function startProbes(hub) {
  setInterval(() => {
    for (const account of hub.accounts) if (account.service.unread?.page) probe(hub, account.id);
  }, PROBE_INTERVAL);
}

// Après une mise en veille du PC ou une coupure réseau : on relance tout de suite les comptes en erreur.
function retryFailed(hub) {
  for (const [id, rt] of hub.runtime) {
    if (rt.status === 'offline') load(hub, id, rt.url || hub.account(id)?.service.url);
    else if (rt.status === 'crashed') reload(hub, id);
  }
}

module.exports = { create, destroy, displayStatus, startLoading, ensureLoaded, reload, home, repair, toggleCompat, zoom, startProbes, retryFailed, load };
