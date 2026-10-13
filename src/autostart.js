// « Lancer au démarrage » : entrée Windows gérée par Electron, fichier XDG autostart sous Linux.
// L'app démarre alors avec --hidden, directement dans la zone de notification.
const { app } = require('electron');
const linux = require('./linux');

// Nom de l'entrée dans le registre : l'AppUserModelId, comme le POC, pour reprendre son entrée sans doublon.
const NAME = 'com.hp.message';
// Version installée seulement : en développement, l'entrée pointerait vers electron.exe.
const supported = () => app.isPackaged && (process.platform === 'win32' || process.platform === 'linux');

function launchArgv() {
  if (process.env.APPIMAGE) return [process.env.APPIMAGE];
  return [process.execPath];
}

const WIN_ITEM = () => ({ path: process.execPath, args: ['--hidden'], name: NAME });

function isEnabled() {
  if (!supported()) return false;
  if (process.platform === 'linux') return linux.getAutostart();
  const settings = app.getLoginItemSettings(WIN_ITEM());
  // executableWillLaunchAtLogin tient compte d'une désactivation dans le Gestionnaire des tâches.
  return settings.executableWillLaunchAtLogin ?? settings.openAtLogin;
}

function setEnabled(enabled) {
  if (!supported()) return;
  if (process.platform === 'linux') linux.setAutostart(enabled, launchArgv());
  else app.setLoginItemSettings({ ...WIN_ITEM(), openAtLogin: enabled, enabled });
}

// Au démarrage : activé d'office la première fois (l'app doit démarrer avec le PC), puis on respecte le choix.
// Sous Linux, on réécrit l'entrée si l'AppImage a changé de place.
function init(prefs, save, log) {
  // Profil de test : ne jamais inscrire l'exécutable testé au démarrage de Windows.
  if (!supported() || process.env.HP_MESSAGE_USER_DATA) return;
  try {
    if (!prefs.autostartInitialized) {
      setEnabled(true);
      prefs.autostartInitialized = true;
      save();
      log('info', 'lancement au démarrage activé (premier lancement)');
    } else if (process.platform === 'linux' && linux.getAutostart()) {
      linux.setAutostart(true, launchArgv());
    }
  } catch (error) {
    log('error', `lancement au démarrage : ${error.message}`);
  }
}

module.exports = { supported, isEnabled, setEnabled, init };
