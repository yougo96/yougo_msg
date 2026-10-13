// Mises à jour de l'app depuis les releases GitHub du dépôt (electron-updater), version installée seulement.
// Vérifie au démarrage puis toutes les 6 h, télécharge en arrière-plan, et installe la nouvelle version sur
// « Redémarrer pour mettre à jour » ou en quittant l'app. Seule requête de l'app hors messageries et correcteur :
// lire la dernière version publiée sur GitHub, sans rien envoyer qui identifie la machine.
const { app, dialog } = require('electron');
const path = require('node:path');
const linux = require('./linux');

const FIRST_CHECK = 60e3; // une fois les messageries chargées
const CHECK_EVERY = 6 * 3600e3;
const RETRY_AFTER_ERROR = 30 * 60e3; // ex. réseau pas encore prêt au démarrage du PC
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

let hub = null;
let updater = null;
let deb = false;
let timer = null;
let manual = false; // vérification demandée depuis le menu : on en donne le résultat
let notified = null;
// status : off, idle, checking, downloading, ready, error
const state = { status: 'off', reason: '', version: null, percent: 0, error: null, checkedAt: null };

function set(patch) {
  Object.assign(state, patch);
  hub.pushState();
  hub.tray?.update();
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(() => check(false), delay);
}

// Jamais en développement ni avec un profil de test : l'installeur remplacerait la vraie installation.
function init(hubInstance) {
  hub = hubInstance;
  if (!app.isPackaged || process.env.YOUGO_MSG_USER_DATA) {
    state.reason = app.isPackaged ? 'profil de test' : 'version de développement';
    return;
  }
  try {
    start(require('electron-updater').autoUpdater);
  } catch (error) {
    hub.log('error', `mise à jour : ${error.message}`);
    state.reason = 'module de mise à jour absent';
  }
}

// Branche un updater d'electron-updater (celui de l'app, ou celui du smoke test, servi en local).
function start(instance, firstCheck = FIRST_CHECK) {
  updater = instance;
  // Un .deb s'installe avec le mot de passe administrateur : jamais par surprise en quittant (ni à la
  // fermeture de session), seulement sur « Redémarrer ».
  deb = updater instanceof require('electron-updater').DebUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = !deb;
  updater.disableWebInstaller = true; // installeur complet (nsis), pas de « web installer »
  // electron-updater envoie un identifiant tiré au hasard et gardé sur la machine : on le remplace.
  updater.requestHeaders = { 'x-user-staging-id': 'yougo-msg' };
  const line = (message) => String(message).split('\n')[0];
  updater.logger = {
    info: (message) => hub.log('info', `mise à jour : ${message}`),
    warn: (message) => hub.log('warn', `mise à jour : ${line(message)}`),
    error: (message) => hub.log('warn', `mise à jour : ${line(message)}`),
    debug: () => {},
  };

  updater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  updater.on('update-not-available', () => {
    set({ status: 'idle', checkedAt: Date.now() });
    schedule(CHECK_EVERY);
    if (manual) tell({ message: 'Yougo Msg est à jour', detail: `Version ${app.getVersion()}.` });
  });
  updater.on('update-available', (info) => set({ status: 'downloading', version: info.version, percent: 0, checkedAt: Date.now() }));
  updater.on('download-progress', (progress) => (state.percent = Math.floor(progress.percent)));
  // Prête : plus de vérification jusqu'au redémarrage (une version plus récente sera vue ensuite).
  updater.on('update-downloaded', (info) => {
    clearTimeout(timer);
    set({ status: 'ready', version: info.version });
    announce();
  });
  updater.on('error', (error) => {
    if (state.status === 'ready') return; // échec d'installation : restart() relance l'ancienne version
    set({ status: 'error', error: line(error?.message ?? error).slice(0, 160), checkedAt: Date.now() });
    schedule(RETRY_AFTER_ERROR);
    if (manual) tell({ type: 'warning', message: 'Mise à jour impossible pour l’instant', detail: `${state.error}\nNouvel essai dans 30 min.` });
  });
  // AppImage : la nouvelle porte le numéro de sa version, le raccourci et le démarrage doivent la suivre.
  updater.on('appimage-filename-updated', (file) => {
    try {
      linux.integrateAppImage(file, ICON);
      if (linux.getAutostart()) linux.setAutostart(true, [file]);
    } catch (error) {
      hub.log('warn', `mise à jour : raccourci de l'AppImage : ${error.message}`);
    }
  });

  set({ status: 'idle', reason: '' });
  schedule(firstCheck);
}

function check(fromMenu) {
  if (!updater || hub.quitting || ['checking', 'downloading', 'ready'].includes(state.status)) return;
  manual = fromMenu;
  updater.checkForUpdates().then(
    // null : format sans mise à jour automatique (Linux hors .deb et AppImage).
    (result) => result === null && set({ status: 'off', reason: 'format sans mise à jour automatique' }),
    () => {}, // l'échec arrive aussi par l'événement « error »
  );
}

function tell({ type = 'info', message, detail, buttons }) {
  manual = false;
  const options = { type, title: 'Yougo Msg', message, detail, buttons, defaultId: 0, cancelId: buttons ? buttons.length - 1 : 0 };
  const win = hub.win && !hub.win.isDestroyed() && hub.win.isVisible() ? hub.win : null;
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

function announce() {
  const later = updater.autoInstallOnAppQuit ? ' Sinon, elle s’installera quand vous quitterez l’app.' : '';
  if (manual) {
    tell({ message: `La version ${state.version} est prête`, detail: `Elle s’installe en redémarrant Yougo Msg.${later}`, buttons: ['Redémarrer maintenant', 'Plus tard'] }).then(
      ({ response }) => response === 0 && restart(),
    );
  } else if (notified !== state.version && !hub.dndActive()) {
    notified = state.version;
    hub.notifier.info('Mise à jour prête', `Version ${state.version} : menu ⋯ → Redémarrer pour l’installer.${later}`);
  }
}

// Relance sans --hidden (on vient de cliquer) ; une AppImage se relance par son fichier, pas par son point de montage.
function relaunch() {
  app.relaunch({ execPath: process.env.APPIMAGE || process.execPath, args: process.argv.slice(1).filter((arg) => arg !== '--hidden') });
}

// Les pages se ferment avant l'installeur : sous Windows, il tue l'app si elle tarde à quitter, et des cookies
// pas encore écrits seraient perdus.
async function restart() {
  if (state.status !== 'ready' || hub.quitting) return;
  hub.log('info', `mise à jour : redémarrage pour installer la version ${state.version}`);
  hub.quitting = true;
  hub.win?.hide();
  await hub.shutdown();
  // Windows : l'installeur relance l'app. AppImage : electron-updater lance la nouvelle. .deb : à nous.
  const installed = updater.install(true, !deb);
  if (deb || !installed) relaunch(); // échec (ex. mot de passe refusé) : l'ancienne version redémarre
  app.quit();
}

// Menu ⋯, sous le numéro de version.
function menuItems() {
  switch (state.status) {
    case 'off':
      return [];
    case 'checking':
      return [{ label: 'Recherche d’une mise à jour…', enabled: false }];
    case 'downloading':
      return [{ label: `Téléchargement de la version ${state.version}… ${state.percent} %`, enabled: false }];
    case 'ready':
      return [{ label: `Redémarrer pour passer à la version ${state.version}`, click: () => restart() }];
    case 'error':
      return [{ label: 'Rechercher une mise à jour (échec, voir le diagnostic)', click: () => check(true) }];
    default:
      return [{ label: 'Rechercher une mise à jour', click: () => check(true) }];
  }
}

// Zone de notification : seulement quand une version attend le redémarrage.
function trayItems() {
  return state.status === 'ready' ? [{ label: `Redémarrer pour passer à la version ${state.version}`, click: () => restart() }] : [];
}

// Pour le diagnostic.
function describe() {
  const time = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  switch (state.status) {
    case 'off':
      return `inactives (${state.reason})`;
    case 'checking':
      return 'vérification en cours';
    case 'downloading':
      return `téléchargement de la version ${state.version} (${state.percent} %)`;
    case 'ready':
      return `version ${state.version} prête, installée au redémarrage`;
    case 'error':
      return `échec à ${time(state.checkedAt)} : ${state.error}`;
    default:
      return state.checkedAt ? `à jour (vérifié à ${time(state.checkedAt)})` : 'première vérification à venir';
  }
}

module.exports = { init, start, check, restart, menuItems, trayItems, describe, state };
