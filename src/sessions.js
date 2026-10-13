// Session d'un compte (partition persist:<id>) : permissions, partage d'écran, préchargement, correcteur, UA.
// Réglée une fois par partition ; les fenêtres d'appel ouvertes par la page héritent de tout.
const { Menu, desktopCapturer, session } = require('electron');
const path = require('node:path');
const { permissionAllowed } = require('./policy');

const SERVICE_PRELOAD = path.join(__dirname, 'preload', 'service.js');
const configured = new Set();

const partitionOf = (accountId) => `persist:${accountId}`;

// Correcteur : sous Windows, celui du système ; sous Linux, dictionnaires Hunspell (téléchargés une fois).
function setupSpellcheck(ses) {
  try {
    const available = ses.availableSpellCheckerLanguages;
    const pick = (candidates) => candidates.find((language) => available.includes(language));
    const languages = [pick(['fr', 'fr-FR']), pick(['en-US', 'en-GB', 'en'])].filter(Boolean);
    if (languages.length) ses.setSpellCheckerLanguages(languages);
  } catch {}
}

// Partage d'écran : petit menu de choix (sous Wayland, le sélecteur du système ne renvoie qu'une source).
async function pickDisplay(getWindow, request, callback) {
  let answered = false;
  const answer = (streams) => {
    if (answered) return;
    answered = true;
    try {
      callback(streams);
    } catch {}
  };
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    const audio = request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined;
    const grant = (source) => answer(audio ? { video: source, audio } : { video: source });
    if (sources.length <= 1) return sources.length ? grant(sources[0]) : answer(null);
    const screens = sources.filter((source) => source.id.startsWith('screen:'));
    const windows = sources.filter((source) => !source.id.startsWith('screen:'));
    const label = (text) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);
    Menu.buildFromTemplate([
      { label: 'Partager…', enabled: false },
      ...screens.map((source, index) => ({ label: screens.length > 1 ? `Écran ${index + 1}` : "Tout l'écran", click: () => grant(source) })),
      { type: 'separator' },
      ...windows.map((source) => ({ label: label(source.name), click: () => grant(source) })),
      { type: 'separator' },
      { label: 'Annuler', click: () => answer(null) },
    ]).popup({ window: getWindow(), callback: () => setTimeout(() => answer(null), 200) });
  } catch {
    answer(null);
  }
}

// getService() : messagerie du compte, lue à chaque appel (le compte peut être modifié pendant la session).
function setupSession({ accountId, getService, getWindow, userAgent, log }) {
  const partition = partitionOf(accountId);
  const ses = session.fromPartition(partition);
  ses.setUserAgent(userAgent);
  if (configured.has(partition)) return ses;
  configured.add(partition);

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const origin = details.requestingUrl || details.securityOrigin;
    const allowed = permissionAllowed(getService(), permission, origin, details);
    // L'API Notification est remplacée dans la page : une vraie demande veut dire qu'une page l'a contournée.
    if (permission === 'notifications') log('warn', `${accountId} : demande de notification native (${origin})`);
    else if (!allowed) log('info', `${accountId} : permission refusée « ${permission} » (${origin})`);
    callback(allowed);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin, details) => permissionAllowed(getService(), permission, origin, details));
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((request, callback) => pickDisplay(getWindow, request, callback));
  // Préchargement au niveau de la session : il couvre aussi les fenêtres ouvertes par la page.
  if (!ses.getPreloadScripts().some((script) => script.id === 'yougo-service')) {
    ses.registerPreloadScript({ type: 'frame', id: 'yougo-service', filePath: SERVICE_PRELOAD });
  }
  setupSpellcheck(ses);
  return ses;
}

module.exports = { setupSession, partitionOf };
