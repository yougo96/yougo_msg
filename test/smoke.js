// Test de bout en bout de la vraie app, sur les vraies pages des messageries (déconnectées), lancé par
// run-smoke.js avec un profil temporaire. N'affiche aucune notification système et n'ouvre pas le navigateur.
const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

if (!process.env.HP_MESSAGE_USER_DATA) throw new Error('profil de test manquant (lancer via npm run smoke)');
const OUT = process.env.HP_MESSAGE_SMOKE_OUT;

// Windows : une fenêtre recouverte, ou l'écran éteint pendant le test, rend toutes les pages « hidden ». Ce calcul
// de Chromium est voulu dans l'app ; ici, on vérifie seulement que l'app masque et montre les bonnes vues.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const opened = [];
shell.openExternal = async (url) => void opened.push(url);

const { getHub } = require('../src/main.js');
const views = require('../src/views.js');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`SMOKE ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` : ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs, stepMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if (await predicate()) return true;
    } catch {}
    await sleep(stepMs);
  }
  return false;
}
const page = (hub, id, code) => hub.views.get(id).webContents.executeJavaScript(code, true);

async function run() {
  await waitFor(() => getHub()?.win, 15000);
  const hub = getHub();
  hub.showWindow();
  hub.win.maximize();
  const ids = hub.accounts.map((account) => account.id);
  check('7 comptes par défaut', ids.length === 7, ids.join(','));

  const loaded = await waitFor(() => hub.accounts.every((account) => ['ready', 'login'].includes(views.displayStatus(hub.rt(account.id)))), 90000, 500);
  check(
    'toutes les pages chargées',
    loaded,
    Object.fromEntries(hub.accounts.map((account) => [account.id, `${views.displayStatus(hub.rt(account.id))} ${hub.rt(account.id).url}`])),
  );
  const sidebarCount = await hub.win.webContents.executeJavaScript('document.querySelectorAll(".account").length');
  check('barre latérale', sidebarCount === ids.length, `${sidebarCount} icônes`);

  // Interception des notifications, passkey et pastille installées partout, rien d'exposé à la page.
  await sleep(1500);
  for (const id of ids) {
    try {
      const info = await page(
        hub,
        id,
        `({
          shim: !/\\[native code\\]/.test(Function.prototype.toString.call(Notification)),
          permission: Notification.permission,
          exposed: Object.keys(window).filter((key) => /hpMessage|__hp/i.test(key)),
          conditional: window.PublicKeyCredential ? String(/\\[native code\\]/.test(String(PublicKeyCredential.isConditionalMediationAvailable))) : 'n/a',
          badge: 'setAppBadge' in Navigator.prototype ? !/\\[native code\\]/.test(String(Navigator.prototype.setAppBadge)) : 'n/a',
          visibility: document.visibilityState,
          ua: navigator.userAgent,
          title: document.title,
        })`,
      );
      const active = id === hub.prefs.activeId;
      check(`${id} : Notification remplacée`, info.shim && info.permission === 'granted', info.permission);
      check(`${id} : pont invisible pour la page`, info.exposed.length === 0, info.exposed);
      check(`${id} : passkey silencieuse neutralisée`, info.conditional === 'false' || info.conditional === 'n/a', info.conditional);
      check(`${id} : setAppBadge intercepté`, info.badge === true || info.badge === 'n/a', String(info.badge));
      check(`${id} : visibilité ${active ? 'visible (affiché)' : 'hidden (masqué)'}`, info.visibility === (active ? 'visible' : 'hidden'), info.visibility);
      check(`${id} : UA Chrome sans jeton Electron`, /Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(info.ua) && !/Electron|HP/i.test(info.ua), info.ua);
    } catch (error) {
      check(`${id} : inspection de la page`, false, error.message);
    }
  }

  // Notification d'une page masquée : relayée avec le nom du compte, clic rejoué dans la bonne page.
  const target = ids.find((id) => id !== hub.prefs.activeId);
  const shown = [];
  const realShow = hub.notifier.show.bind(hub.notifier);
  hub.notifier.show = (account, options) => shown.push({ account: account.id, ...options });
  await page(hub, target, `window.__smoke = 0; const n = new Notification('Bonjour', { body: 'Corps', tag: 'conv-1' }); n.onclick = () => (window.__smoke += 1); n.addEventListener('click', () => (window.__smoke += 10)); 1`);
  await waitFor(() => shown.length > 0, 3000);
  const relayed = shown[0];
  check('notification relayée', relayed && relayed.account === target && relayed.title === `${hub.account(target).name} · Bonjour` && relayed.body === 'Corps', relayed && { title: relayed.title, body: relayed.body });
  if (relayed?.frame) {
    relayed.frame.send('service:notification-click', relayed.pageId);
    await sleep(500);
    const clicked = await page(hub, target, 'window.__smoke');
    check('clic rejoué dans la page (onclick + listener)', clicked === 11, String(clicked));
  }
  hub.setDnd('on');
  const before = hub.rt(target).stats.suppressed;
  await page(hub, target, `new Notification('Pendant ne pas déranger'); 1`);
  await sleep(500);
  check('ne pas déranger bloque', hub.rt(target).stats.suppressed === before + 1 && shown.length === 1, hub.rt(target).stats);
  hub.setDnd('off');
  // Messenger passe parfois des éléments React.
  await page(hub, target, `new Notification({ props: { content: ['Marie'] } }, { body: { props: { content: ['Salut'] } } }); 1`);
  await waitFor(() => shown.length > 1, 3000);
  check('titres non textuels convertis', shown[1]?.title?.endsWith('· Marie') && shown[1]?.body === 'Salut', shown[1] && { title: shown[1].title, body: shown[1].body });
  hub.notifier.show = realShow;

  // Compteur de non-lus depuis le titre, total et titre de la fenêtre.
  const counted = ids.find((id) => id === 'whatsapp') ?? ids[0];
  await page(hub, counted, `document.title = '(3) Test'; 1`);
  const rose = await waitFor(() => hub.rt(counted).unread.count === 3, 3000);
  check('compteur lu dans le titre', rose, hub.rt(counted).unread);
  await sleep(300);
  check('titre de la fenêtre', hub.win.getTitle().startsWith('(3'), hub.win.getTitle());
  const badgeReady = await waitFor(() => hub.badgeImages.get('3')?.tray, 3000);
  check('pastille dessinée pour la zone de notification', badgeReady);
  if (badgeReady && OUT) fs.writeFileSync(path.join(OUT, 'tray-3.png'), hub.badgeImages.get('3').tray.toPNG({ scaleFactor: 2 }));
  if (OUT && hub.badgeImages.get('')?.tray) fs.writeFileSync(path.join(OUT, 'tray-idle.png'), hub.badgeImages.get('').tray.toPNG({ scaleFactor: 2 }));
  if (OUT && hub.badgeImages.get('3')?.overlay) fs.writeFileSync(path.join(OUT, 'overlay-3.png'), hub.badgeImages.get('3').overlay.toPNG({ scaleFactor: 2 }));
  hub.toggleMuted(counted);
  await sleep(300);
  check('compte coupé exclu du total', !hub.win.getTitle().startsWith('(3'), hub.win.getTitle());
  hub.toggleMuted(counted);
  if (hub.views.has('discord')) {
    await page(hub, 'discord', `document.title = '• Discord | Amis'; 1`);
    check('Discord : pastille sans nombre', await waitFor(() => hub.rt('discord').unread.dot === true, 3000), hub.rt('discord').unread);
  }

  // Navigation et fenêtres : le reste du web part dans le navigateur.
  const navId = ids.find((id) => id === 'discord') ?? ids[0];
  const hostBefore = new URL(hub.views.get(navId).webContents.getURL()).host;
  await page(hub, navId, `window.open('https://example.org/popup'); 1`);
  await page(hub, navId, `location.href = 'https://example.org/navigation'; 1`);
  await sleep(1500);
  check('window.open externe -> navigateur', opened.includes('https://example.org/popup'), opened);
  const hostAfter = new URL(hub.views.get(navId).webContents.getURL()).host;
  check('navigation externe -> navigateur, la vue reste', opened.includes('https://example.org/navigation') && hostAfter === hostBefore, hostAfter);
  check('aucune fenêtre parasite', hub.rt(navId).popups.size === 0, hub.rt(navId).popups.size);

  // Permissions.
  const permissions = await page(
    hub,
    navId,
    `Promise.all(['geolocation', 'notifications', 'camera'].map((name) => navigator.permissions.query({ name }).then((s) => name + '=' + s.state, (e) => name + '=' + e.name)))`,
  );
  check('permissions (géoloc refusée, notifications accordées)', permissions.includes('geolocation=denied') && permissions.includes('notifications=granted'), permissions);

  // Passkey silencieuse : en attente jusqu'à l'annulation, jamais transmise à Windows Hello.
  const passkey = await page(
    hub,
    navId,
    `(async () => {
      const controller = new AbortController();
      const pending = navigator.credentials.get({ mediation: 'conditional', publicKey: { challenge: new Uint8Array(32) }, signal: controller.signal });
      const state = await Promise.race([pending.then(() => 'résolue', () => 'rejetée'), new Promise((r) => setTimeout(() => r('en attente'), 300))]);
      controller.abort();
      const after = await pending.then(() => 'résolue', (e) => 'rejetée:' + e.name);
      const already = await navigator.credentials.get({ mediation: 'conditional', publicKey: { challenge: new Uint8Array(32) }, signal: AbortSignal.abort() }).then(() => 'résolue', (e) => 'rejetée:' + e.name);
      return [state, after, already, await PublicKeyCredential.isConditionalMediationAvailable()].join(' ');
    })()`,
  );
  check('passkey silencieuse : attente puis annulation', passkey === 'en attente rejetée:AbortError rejetée:AbortError false', passkey);

  // Hors ligne : la vue passe en erreur, la barre latérale le montre, nouvelle tentative programmée.
  const offlineId = ids.find((id) => id === 'snapchat') ?? ids[1];
  views.load(hub, offlineId, 'https://hp-message-smoke.invalid/');
  const offline = await waitFor(() => hub.rt(offlineId).status === 'offline', 15000);
  await sleep(1500);
  check('page injoignable -> hors ligne, nouvelle tentative programmée', offline && hub.rt(offlineId).status === 'offline' && hub.rt(offlineId).retryAt > Date.now(), { status: hub.rt(offlineId).status, retryAt: hub.rt(offlineId).retryAt });
  views.home(hub, offlineId);
  check('retour à la normale', await waitFor(() => ['ready', 'login'].includes(views.displayStatus(hub.rt(offlineId))), 30000), views.displayStatus(hub.rt(offlineId)));

  // Page plantée : relancée automatiquement.
  const crashId = ids.find((id) => id === 'googlemessages') ?? ids[2];
  hub.views.get(crashId).webContents.forcefullyCrashRenderer();
  const crashed = await waitFor(() => hub.rt(crashId).status === 'crashed', 5000);
  const recovered = await waitFor(() => ['ready', 'login'].includes(views.displayStatus(hub.rt(crashId))), 30000);
  check('page plantée -> relancée seule', crashed && recovered, views.displayStatus(hub.rt(crashId)));

  // Changement de compte : seul le compte affiché est « visible ».
  hub.select(ids[3]);
  await sleep(500);
  const visibility = await Promise.all(ids.map((id) => page(hub, id, 'document.visibilityState')));
  check('un seul compte visible après changement', visibility.filter((state) => state === 'visible').length === 1 && visibility[3] === 'visible', {
    visibility,
    activeId: hub.prefs.activeId,
    views: ids.map((id) => `${id}:${hub.views.get(id).getVisible?.()}:${views.displayStatus(hub.rt(id))}:${hub.rt(id).popups.size}`),
  });

  if (OUT) fs.writeFileSync(path.join(OUT, 'sidebar.png'), (await hub.win.webContents.capturePage()).toPNG());

  // Fenêtre étroite : la liste se replie en colonne d'icônes, et les pages suivent.
  const listX = hub.views.get(ids[3]).getBounds().x;
  hub.win.unmaximize();
  await sleep(300);
  hub.win.setContentSize(900, 700);
  const compact = await waitFor(
    async () => hub.views.get(ids[3]).getBounds().x < listX && (await hub.win.webContents.executeJavaScript('document.body.classList.contains("compact")')),
    3000,
  );
  check('barre en liste, repliée quand la fenêtre est étroite', listX > 200 && compact, { liste: listX, repliee: hub.views.get(ids[3]).getBounds().x });
  if (OUT) fs.writeFileSync(path.join(OUT, 'sidebar-compact.png'), (await hub.win.webContents.capturePage()).toPNG());
  check('réglages enregistrés', fs.existsSync(path.join(app.getPath('userData'), 'settings.json')));
  check('journal écrit', fs.existsSync(path.join(app.getPath('userData'), 'logs', 'hp-message.log')));

  const failed = results.filter((result) => !result.ok);
  console.log(`SMOKE_RESULT ${JSON.stringify({ total: results.length, failed: failed.length })}`);
  if (OUT) fs.writeFileSync(path.join(OUT, 'smoke-results.json'), JSON.stringify(results, null, 2));
  console.log(`SMOKE_QUIT ${Date.now()}`);
  app.quit();
}

app.whenReady().then(() =>
  run().catch((error) => {
    console.log(`SMOKE FAIL exception : ${error.stack}`);
    console.log(`SMOKE_QUIT ${Date.now()}`);
    app.quit();
  }),
);
