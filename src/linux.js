// Intégration au bureau Linux : zone de notification, lancement au démarrage, AppImage. Sans Electron (testé).

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DESKTOP_ID = 'com.yougo.msg'; // = desktopName dans package.json, sans « .desktop »

const run = (command, args) =>
  new Promise((resolve) => execFile(command, args, { timeout: 2000 }, (error, stdout) => resolve(error ? null : String(stdout))));

// Même test que Chromium : sans hôte StatusNotifier, l'icône de la zone de notification serait invisible
// (GNOME sans l'extension AppIndicator) et fermer la fenêtre la rendrait introuvable.
async function trayHostAvailable() {
  const W = 'org.kde.StatusNotifierWatcher';
  const out =
    (await run('busctl', ['--user', 'get-property', W, '/StatusNotifierWatcher', W, 'IsStatusNotifierHostRegistered'])) ??
    (await run('gdbus', ['call', '--session', '--dest', W, '--object-path', '/StatusNotifierWatcher', '--method', 'org.freedesktop.DBus.Properties.Get', W, 'IsStatusNotifierHostRegistered']));
  return /\btrue\b/.test(out ?? '');
}

// Au démarrage de la session, le bureau peut publier son hôte après le lancement de l'app.
async function waitForTrayHost(timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await trayHostAvailable()) return true;
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Règles Exec des fichiers .desktop : guillemets si besoin, \ " ` $ échappés, puis \ doublé, % en %%.
function execArg(arg) {
  const plain = arg.replace(/%/g, '%%');
  if (!/[\s"'\\<>~|&;$*?#()`]/.test(arg)) return plain;
  return `"${plain.replace(/["`$\\]/g, '\\$&').replace(/\\/g, '\\\\')}"`;
}

function desktopEntry({ name, comment, argv, icon, extra = [] }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.5',
    `Name=${name}`,
    `Comment=${comment}`,
    `Exec=${argv.map(execArg).join(' ')}`,
    `Icon=${icon}`,
    'Terminal=false',
    ...extra,
    '',
  ].join('\n');
}

const configHome = () => process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const autostartFile = (id = DESKTOP_ID) => path.join(configHome(), 'autostart', `${id}.desktop`);
const launcherFile = (id = DESKTOP_ID) => path.join(dataHome(), 'applications', `${id}.desktop`);
const iconFile = (id = DESKTOP_ID) => path.join(dataHome(), 'icons', 'hicolor', '512x512', 'apps', `${id}.png`);

function getAutostart() {
  try {
    const text = fs.readFileSync(autostartFile(), 'utf8');
    return !/^Hidden\s*=\s*true\s*$/im.test(text) && !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(text);
  } catch {
    return false;
  }
}

// launchArgv : commande qui relance l'app (AppImage : le fichier .AppImage, jamais son point de montage /tmp).
function setAutostart(enabled, launchArgv) {
  const file = autostartFile();
  if (!enabled) return fs.rmSync(file, { force: true }); // supprimer est le seul « off » respecté partout
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    desktopEntry({
      name: 'Yougo Msg',
      comment: 'Toutes mes messageries dans une seule fenêtre',
      argv: [...launchArgv, '--hidden'],
      icon: DESKTOP_ID,
      extra: ['X-GNOME-Autostart-enabled=true'],
    }),
  );
}

// Une AppImage n'installe ni raccourci ni icône : sans eux, pas d'icône dans le dock, pas de regroupement des
// fenêtres sous Wayland, pas de pastille. On les écrit dans le dossier de l'utilisateur.
function integrateAppImage(appImagePath, iconSource) {
  const icon = iconFile();
  fs.mkdirSync(path.dirname(icon), { recursive: true });
  fs.copyFileSync(iconSource, icon);
  const file = launcherFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = desktopEntry({
    name: 'Yougo Msg',
    comment: 'Toutes mes messageries dans une seule fenêtre',
    argv: [appImagePath],
    icon: DESKTOP_ID,
    extra: ['Categories=Network;InstantMessaging;', `StartupWMClass=${DESKTOP_ID}`],
  });
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
}

// Fichiers d'un ancien nom de l'app (cf. legacy.js) : démarrage, raccourci et icône de l'AppImage.
function removeIntegration(id) {
  for (const file of [autostartFile(id), launcherFile(id), iconFile(id)]) fs.rmSync(file, { force: true });
}

// Les serveurs de notifications GNOME et KDE interprètent un balisage dans le texte.
const escapeMarkup = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { DESKTOP_ID, trayHostAvailable, waitForTrayHost, execArg, desktopEntry, getAutostart, setAutostart, integrateAppImage, removeIntegration, escapeMarkup, autostartFile };
