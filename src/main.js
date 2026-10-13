// Point d'entrée : réglages de démarrage, instance unique, branchements, fermeture propre.
const { app, ipcMain, powerMonitor } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const CATALOG = require('./services');
const { ID_PATTERN } = require('./accounts');
const { SettingsStore } = require('./settings');
const { createLog } = require('./log');
const { hostMatches } = require('./policy');
const { Hub } = require('./hub');
const { AppTray } = require('./tray');
const views = require('./views');
const autostart = require('./autostart');
const diagnostics = require('./diagnostics');
const linux = require('./linux');

const APP_ID = 'com.hp.message'; // = build.appId dans package.json (vérifié par test/services.test.js)

// Profil séparé pour les tests : un test ne doit jamais toucher au vrai profil (sessions des messageries).
if (process.env.HP_MESSAGE_USER_DATA) app.setPath('userData', path.resolve(process.env.HP_MESSAGE_USER_DATA));

if (process.platform === 'linux') {
  // Les cookies ne sont pas chiffrés (fusible cookieEncryption désactivé) : les sessions ne dépendent pas du
  // trousseau. On fige quand même 'basic' pour que rien ne déclenche jamais une demande de déverrouillage.
  app.commandLine.appendSwitch('password-store', 'basic');
}

if (process.platform === 'win32') {
  // Identité des notifications Windows. Installé : = appId, comme le raccourci créé par l'installeur.
  app.setAppUserModelId(app.isPackaged ? APP_ID : `${APP_ID}.dev`);
  app.setToastActivatorCLSID(app.isPackaged ? '{E88BD6EF-F390-43E3-84C6-5F3748766115}' : '{A8783146-F145-4634-A378-0C0D8CD28B36}');
}

// UA d'un Chrome standard : sans les jetons « Electron/x » ou du nom de l'app que WhatsApp, Snapchat et
// Instagram refusent. Le numéro de version suit le Chromium embarqué.
const PLATFORM = { win32: 'Windows NT 10.0; Win64; x64', darwin: 'Macintosh; Intel Mac OS X 10_15_7', linux: 'X11; Linux x86_64' }[process.platform];
const CHROME_MAJOR = process.versions.chrome.split('.')[0];
const userAgents = {
  chrome: `Mozilla/5.0 (${PLATFORM}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`,
  // UA d'origine d'Electron : certaines connexions Google le préfèrent (« mode compatibilité »).
  electron: app.userAgentFallback,
};
app.userAgentFallback = userAgents.chrome;

let hub = null;
let log = (level, message) => console[level === 'error' ? 'error' : 'log'](message);

// Une erreur imprévue ne doit pas afficher la boîte d'erreur d'Electron dans une app qui tourne en arrière-plan.
process.on('uncaughtException', (error) => log('error', `exception : ${error.stack ?? error}`));
process.on('unhandledRejection', (error) => log('error', `promesse rejetée : ${error?.stack ?? error}`));

// Comptes retirés : leurs fichiers étaient verrouillés pendant la session, on les efface maintenant.
function deletePendingPartitions(store) {
  const keep = new Set(store.data.accounts.map((account) => account.id));
  const partitions = path.join(app.getPath('userData'), 'Partitions');
  store.data.pendingPartitionDeletes = store.data.pendingPartitionDeletes.filter((id) => {
    if (keep.has(id) || !ID_PATTERN.test(id)) return false;
    try {
      fs.rmSync(path.join(partitions, id), { recursive: true, force: true });
      log('info', `partition effacée : ${id}`);
      return false;
    } catch (error) {
      log('warn', `partition ${id} non effacée : ${error.message}`);
      return true;
    }
  });
  store.save();
}

// Dernier recours si la fermeture se bloque malgré tout (cf. piège Windows du playbook) : un processus détaché
// tue l'app 10 s plus tard, sinon le processus fantôme garderait le verrou d'instance unique.
function startQuitWatchdog() {
  const pid = process.pid;
  const exe = process.execPath;
  try {
    if (process.platform === 'win32') {
      // `timeout` ne marche pas sans console : `ping` sert de pause.
      const command = `"ping -n 11 127.0.0.1 >nul & taskkill /F /T /FI "PID eq ${pid}" /FI "IMAGENAME eq ${path.basename(exe)}" >nul 2>nul"`;
      spawn('cmd.exe', ['/d', '/s', '/c', command], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
    } else if (process.platform === 'linux') {
      const quoted = `'${exe.replace(/'/g, `'\\''`)}'`;
      spawn('sh', ['-c', `sleep 10; [ "$(readlink /proc/${pid}/exe)" = ${quoted} ] && kill -9 ${pid}`], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (error) {
    log('warn', `garde-fou de fermeture non lancé : ${error.message}`);
  }
}

function registerIpc() {
  const fromSidebar = (event) => hub.win && !hub.win.isDestroyed() && event.sender === hub.win.webContents;
  const onSidebar = (channel, handler) => ipcMain.on(channel, (event, ...args) => fromSidebar(event) && handler(...args));
  ipcMain.handle('hub:get-state', (event) => (fromSidebar(event) ? hub.snapshot() : null));
  onSidebar('hub:select', (id) => hub.select(id));
  onSidebar('hub:account-menu', (id) => hub.accountMenu(id));
  onSidebar('hub:app-menu', () => hub.appMenu());
  onSidebar('hub:toggle-dnd', () => hub.setDnd(hub.dndActive() ? 'off' : 'on'));
  onSidebar('hub:dnd-menu', () => hub.dndMenu());
  onSidebar('hub:retry', (id) => views.reload(hub, id));
  onSidebar('hub:place', (id, targetId, position) => hub.placeAccount(id, targetId, position === 'after'));
  onSidebar('hub:badge-images', (key, images) => typeof key === 'string' && key.length <= 4 && images && hub.setBadgeImages(key, images));

  // Messages des pages des messageries : on vérifie de quel compte et de quel domaine ils viennent.
  const fromService = (event) => {
    const account = hub.accountForWebContents(event.sender);
    const frame = event.senderFrame;
    if (!account || !frame) return null;
    try {
      const { protocol, hostname } = new URL(frame.origin);
      return protocol === 'https:' && hostMatches(hostname, account.service.hosts) ? { account, frame } : null;
    } catch {
      return null;
    }
  };
  ipcMain.on('service:config', (event) => {
    event.returnValue = null; // toujours répondre : la page attend cette réponse pour continuer
    const source = fromService(event);
    if (!source) return;
    const { service } = source.account;
    event.returnValue = { noPush: service.noPush === true, localStorage: source.frame.parent ? {} : (service.localStorage ?? {}) };
  });
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  ipcMain.on('service:notify', (event, payload) => {
    const source = fromService(event);
    if (!source || typeof payload?.id !== 'string') return;
    hub.notifier.fromPage(source.account, source.frame, {
      id: payload.id.slice(0, 64),
      title: text(payload.title, 500),
      body: text(payload.body, 2000),
      tag: text(payload.tag, 200),
      silent: payload.silent === true,
    });
  });
  ipcMain.on('service:notification-close', (event, id) => {
    const source = fromService(event);
    if (source && typeof id === 'string') hub.notifier.closeFromPage(source.account, source.frame, id);
  });
  ipcMain.on('service:badge', (event, value) => {
    const source = fromService(event);
    if (source && typeof value === 'number') hub.rt(source.account.id)?.tracker.setBadge(value);
  });
}

async function start() {
  const userData = app.getPath('userData');
  log = createLog(path.join(userData, 'logs'));
  log('info', `démarrage ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform})${app.isPackaged ? '' : ' [dev]'}`);

  const store = new SettingsStore(path.join(userData, 'settings.json'), CATALOG, log);
  deletePendingPartitions(store);
  hub = new Hub({ catalog: CATALOG, store, log, userAgents });
  registerIpc();
  diagnostics.register(hub);

  if (process.platform === 'linux' && process.env.APPIMAGE) {
    try {
      linux.integrateAppImage(process.env.APPIMAGE, path.join(__dirname, '..', 'assets', 'icon.png'));
    } catch (error) {
      log('warn', `intégration AppImage : ${error.message}`);
    }
  }

  const hidden = process.argv.includes('--hidden');
  hub.createWindow();
  hub.sync();
  hub.scheduleDndEnd();
  views.startLoading(hub);
  views.startProbes(hub);

  // Linux : sans hôte de zone de notification, la fenêtre ne se cache jamais (elle serait introuvable).
  if (process.platform === 'linux') {
    hub.trayAvailable = await linux.waitForTrayHost(hidden ? 20000 : 1500);
    log('info', `zone de notification ${hub.trayAvailable ? 'disponible' : 'absente : fermer = réduire'}`);
  }
  if (hub.trayAvailable) hub.tray = new AppTray(hub);
  if (!hidden || !hub.trayAvailable) hub.showWindow();
  if (process.platform === 'linux' && !hub.trayAvailable) {
    // L'hôte peut apparaître plus tard (extension activée, plasmashell relancé).
    const poll = setInterval(async () => {
      if (hub.quitting || !(await linux.trayHostAvailable())) return;
      clearInterval(poll);
      hub.trayAvailable = true;
      hub.tray = new AppTray(hub);
      log('info', 'zone de notification apparue');
    }, 5000);
    setTimeout(() => clearInterval(poll), 120e3);
  }

  autostart.init(hub.prefs, () => hub.save(), log);
  // Après une mise en veille ou un verrouillage, les comptes en erreur réessaient tout de suite.
  for (const event of ['resume', 'unlock-screen']) powerMonitor.on(event, () => setTimeout(() => views.retryFailed(hub), 5000));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Deuxième lancement (raccourci, menu des applications) : on montre la fenêtre déjà ouverte.
  app.on('second-instance', () => hub?.showWindow());
  // La fenêtre principale ne se ferme qu'en quittant : rien à faire quand une autre fenêtre se ferme.
  app.on('window-all-closed', () => {});

  let quitPhase = 'running';
  app.on('before-quit', (event) => {
    if (quitPhase === 'done' || !hub) return;
    event.preventDefault();
    if (quitPhase === 'closing') return;
    quitPhase = 'closing';
    hub.quitting = true;
    log('info', 'fermeture');
    startQuitWatchdog();
    hub.store.flush();
    (async () => {
      // Pages d'abord (cf. passkey), puis écriture des cookies et du stockage sur le disque.
      const sessions = [...hub.views.values()].map((view) => view.webContents.session);
      await hub.closeAllPages();
      await Promise.allSettled(
        sessions.map((ses) => {
          ses.flushStorageData();
          return ses.cookies.flushStore();
        }),
      );
      quitPhase = 'done';
      app.quit();
    })().catch(() => {
      quitPhase = 'done';
      app.quit();
    });
  });
  app.on('will-quit', () => hub?.tray?.destroy());

  app.whenReady().then(start).catch((error) => {
    log('error', `démarrage impossible : ${error.stack ?? error}`);
    app.exit(1);
  });
}

module.exports = { getHub: () => hub, APP_ID };
