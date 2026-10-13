// Régénère les images du README dans docs/ (npm run screenshots), en 2x pour rester nettes :
//   apercu.png        la fenêtre : la vraie barre latérale, remplie de comptes de démonstration ;
//   compact.png       la même en fenêtre étroite (colonne d'icônes), ne pas déranger activé ;
//   notification.png  une notification et les pastilles de la barre des tâches, avec les vraies icônes.
// La page de messagerie, la notification et la barre des tâches sont dessinées ici : aucun vrai compte, aucun
// vrai message. Lancé par Electron, avec un profil temporaire.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const catalog = require('../src/services');
const { summarize } = require('../src/unread');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const UI = path.join(ROOT, 'src', 'ui');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yougo-msg-screenshots-'));

app.setPath('userData', TEMP);

// Comptes de démonstration, dans l'ordre du catalogue, avec un second WhatsApp renommé et coupé.
function account(serviceId, extra = {}) {
  const service = catalog.find((entry) => entry.id === serviceId);
  return {
    id: serviceId,
    name: service.name,
    serviceId,
    serviceName: service.name,
    color: service.color,
    number: 0,
    muted: false,
    unread: { count: 0, dot: false },
    status: 'ready',
    retryAt: null,
    error: null,
    ...extra,
  };
}

const ACCOUNTS = [
  account('messenger', { unread: { count: 1, dot: false } }),
  account('whatsapp', { number: 1, unread: { count: 3, dot: false } }),
  account('whatsapp', { id: 'whatsapp-demo', name: 'WhatsApp Pro', number: 2, muted: true, unread: { count: 4, dot: false } }),
  account('instagram'),
  account('snapchat'),
  account('googlechat', { unread: { count: 2, dot: false } }),
  account('googlemessages', { status: 'login', unread: { count: null, dot: false } }),
  account('discord', { unread: { count: 0, dot: true } }),
];

// État envoyé à la barre latérale, comme hub.snapshot() : liste de 248 px, colonne d'icônes de 72 px sous 1200 px.
function hubState(width, dnd) {
  const sidebarWidth = width < 1200 ? 72 : 248;
  return {
    sidebarWidth,
    compact: sidebarWidth === 72,
    summary: summarize(ACCOUNTS),
    platform: 'win32',
    activeId: 'whatsapp',
    dnd,
    update: { ready: false, version: null },
    accounts: ACCOUNTS,
    badgeRequests: [],
  };
}

// Page de messagerie de démonstration, à droite de la barre (la vraie est la version web du service).
const CHATS = [
  { initial: 'M', name: 'Marie', time: '18:42', preview: 'Et je m’occupe du dessert', open: true },
  { initial: 'F', name: 'Famille', time: '18:20', preview: 'Papa : les photos du week-end', unread: 2 },
  { initial: 'T', name: 'Club de tennis', time: '17:05', preview: 'Le match est décalé à samedi', unread: 1 },
  { initial: 'L', name: 'Lucas', time: '16:48', preview: 'Merci pour hier !' },
  { initial: 'C', name: 'Camille', time: 'Hier', preview: 'Je te redis demain' },
  { initial: 'T', name: 'Thomas', time: 'Hier', preview: 'On en reparle lundi' },
];

const MESSAGES = [
  { from: 'in', text: 'Alors, ce film ?', time: '12:10' },
  { from: 'out', text: 'Vu hier soir, génial 🍿', time: '12:14' },
  { from: 'in', text: 'Je savais qu’il te plairait', time: '12:15' },
  { from: 'in', text: 'Coucou ! Tu passes toujours ce soir ?', time: '18:31' },
  { from: 'out', text: 'Oui, vers 19 h. Je prends quelque chose ?', time: '18:35' },
  { from: 'in', text: 'Juste toi 😄', time: '18:36' },
  { from: 'in', text: 'Et je m’occupe du dessert', time: '18:42' },
];

const ICON = {
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
  more: '<svg viewBox="0 0 24 24" class="demo-fill"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
};

const PAGE_HTML = `<div class="demo">
  <section class="demo-list">
    <h2>Discussions</h2>
    <div class="demo-search">${ICON.search}<span>Rechercher</span></div>
    <ul>${CHATS.map(
      (chat, index) => `<li class="${chat.open ? 'open' : ''}">
        <span class="demo-avatar demo-a${index}">${chat.initial}</span>
        <span class="demo-main">
          <span class="demo-line"><b>${chat.name}</b><time class="${chat.unread ? 'new' : ''}">${chat.time}</time></span>
          <span class="demo-line"><span class="demo-preview">${chat.preview}</span>${chat.unread ? `<em>${chat.unread}</em>` : ''}</span>
        </span>
      </li>`,
    ).join('')}</ul>
  </section>
  <section class="demo-conversation">
    <header><span class="demo-avatar demo-a0">M</span><span class="demo-who">Marie<small>en ligne</small></span>${ICON.search}${ICON.more}</header>
    <div class="demo-messages">
      <span class="demo-day">Aujourd’hui</span>
      ${MESSAGES.map((message) => `<p class="demo-${message.from}">${message.text}<time>${message.time}</time></p>`).join('')}
    </div>
    <footer>${ICON.plus}<span class="demo-input">Écrire un message</span>${ICON.mic}</footer>
  </section>
</div>`;

const PAGE_CSS = `
body #stage { display: block; place-items: normal; padding: 0; }
.demo { display: flex; height: 100%; background: #0b141a; color: #e9edef; font: 14px 'Segoe UI', system-ui, sans-serif; }
.demo svg { flex-shrink: 0; width: 22px; height: 22px; fill: none; stroke: #aebac1; stroke-width: 1.8; stroke-linecap: round; }
.demo svg.demo-fill { fill: #aebac1; stroke: none; }
.demo-list { flex-shrink: 0; width: 360px; border-right: 1px solid #222d34; background: #111b21; }
.compact .demo-list { width: 320px; }
.demo-list h2 { margin: 0; padding: 20px 18px 14px; font-size: 21px; font-weight: 600; }
.demo-search { display: flex; align-items: center; gap: 14px; margin: 0 12px 10px; padding: 8px 14px; border-radius: 8px; background: #202c33; color: #8696a0; }
.demo-search svg { width: 18px; height: 18px; stroke: #8696a0; }
.demo-list ul { margin: 0; padding: 0; list-style: none; }
.demo-list li { display: flex; align-items: center; gap: 14px; padding: 0 14px; }
.demo-list li.open { background: #2a3942; }
.demo-avatar { display: grid; flex-shrink: 0; place-items: center; width: 48px; height: 48px; border-radius: 50%; color: #fff; font-size: 18px; font-weight: 600; }
.demo-a0 { background: #b5577b; } .demo-a1 { background: #4f7fbf; } .demo-a2 { background: #4a9a74; }
.demo-a3 { background: #c07a3e; } .demo-a4 { background: #8662b8; } .demo-a5 { background: #5b8f9b; }
.demo-main { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; padding: 13px 0; border-bottom: 1px solid #222d34; }
.demo-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.demo-line b { font-size: 16px; font-weight: 400; }
.demo-line time { color: #8696a0; font-size: 12px; }
.demo-line time.new { color: #00a884; }
.demo-preview { overflow: hidden; color: #8696a0; text-overflow: ellipsis; white-space: nowrap; }
.demo-line em { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #00a884; color: #111b21; font-size: 12px; font-style: normal; font-weight: 600; line-height: 20px; text-align: center; }
.demo-conversation { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.demo-conversation header { display: flex; align-items: center; gap: 14px; height: 60px; padding: 0 20px 0 16px; background: #202c33; }
.demo-conversation header .demo-avatar { width: 40px; height: 40px; font-size: 16px; }
.demo-who { flex: 1; font-size: 16px; }
.demo-who small { display: block; color: #8696a0; font-size: 13px; }
.demo-conversation header svg + svg { margin-left: 10px; }
.demo-messages { display: flex; flex: 1; flex-direction: column; justify-content: flex-end; gap: 3px; padding: 20px 7%; }
.demo-day { align-self: center; margin-bottom: 12px; padding: 5px 12px; border-radius: 8px; background: #182229; color: #8696a0; font-size: 12.5px; }
.demo-messages p { max-width: 65%; margin: 0; padding: 7px 10px 8px; border-radius: 8px; font-size: 14.5px; line-height: 19px; }
.demo-messages time { float: right; margin: 7px 0 -5px 12px; color: rgba(233, 237, 239, 0.6); font-size: 11px; }
.demo-in { align-self: flex-start; background: #202c33; }
.demo-out { align-self: flex-end; background: #005c4b; }
.demo-in + .demo-out, .demo-out + .demo-in { margin-top: 10px; }
.demo-conversation footer { display: flex; align-items: center; gap: 16px; padding: 10px 18px; background: #202c33; }
.demo-input { flex: 1; padding: 10px 14px; border-radius: 8px; background: #2a3942; color: #8696a0; }
/* Boutons de la fenêtre, que Windows dessine sur la bande de titre. */
.demo-caption { position: absolute; top: 0; right: 0; display: flex; }
.demo-caption svg { width: 46px; height: 32px; fill: none; stroke: #fff; stroke-width: 1; }
`;

const CAPTION_HTML = `<span class="demo-caption">
  <svg viewBox="0 0 46 32"><path d="M18 16.5h10"/></svg>
  <svg viewBox="0 0 46 32"><rect x="18.5" y="11.5" width="9" height="9"/></svg>
  <svg viewBox="0 0 46 32"><path d="M18 11l10 10M28 11l-10 10"/></svg>
</span>`;

// Coin du bureau Windows : une notification au-dessus de la barre des tâches (pastille de l'app, icône près de
// l'horloge), avec le dessin de badge-art.js comme dans l'app.
function notificationHtml() {
  const tile = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'assets', 'services', 'messenger.png')).toString('base64')}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  html, body { height: 100%; margin: 0; }
  body { position: relative; overflow: hidden; color: #fff; font-family: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    background: radial-gradient(circle at 10% 0%, #22474e, transparent 60%), linear-gradient(160deg, #1b2533, #0e1218); }
  .toast { position: absolute; right: 12px; bottom: 60px; width: 364px; box-sizing: border-box; padding: 12px 16px 18px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; background: #2c2c2c; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); }
  .toast header { display: flex; align-items: center; gap: 8px; color: #d4d4d4; font-size: 12px; }
  .toast header img { width: 16px; height: 16px; }
  .toast header span:last-child { margin-left: auto; color: #b8b8b8; letter-spacing: 0.3em; }
  .toast .content { display: flex; gap: 14px; margin-top: 14px; }
  .toast .content img { flex-shrink: 0; width: 48px; height: 48px; }
  .toast strong { display: block; font-size: 14px; font-weight: 600; }
  .toast p { margin: 3px 0 0; color: #d0d0d0; font-size: 14px; line-height: 20px; }
  .taskbar { position: absolute; right: 0; bottom: 0; left: 0; display: flex; align-items: center; height: 48px; padding: 0 8px 0 24px; border-top: 1px solid rgba(255, 255, 255, 0.07); background: rgba(32, 32, 32, 0.94); }
  .app { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 4px; background: rgba(255, 255, 255, 0.07); }
  .app img { width: 24px; height: 24px; }
  .app img.overlay { position: absolute; right: 3px; bottom: 4px; width: 16px; height: 16px; }
  .app::after { content: ''; position: absolute; bottom: 1px; left: 50%; width: 16px; height: 3px; margin-left: -8px; border-radius: 2px; background: #60cdff; }
  .tray { display: flex; align-items: center; gap: 2px; margin-left: auto; }
  .tray > span { display: grid; place-items: center; height: 40px; padding: 0 8px; border-radius: 4px; }
  .tray img { width: 16px; height: 16px; }
  .tray svg { width: 14px; height: 14px; fill: none; stroke: #fff; stroke-width: 1.3; }
  .clock { font-size: 12px; line-height: 16px; text-align: right; }
</style>
</head>
<body>
  <div class="toast">
    <header><img id="app-icon" alt=""><span>Yougo Msg</span><span>··· ✕</span></header>
    <div class="content">
      <img src="${tile}" alt="">
      <div><strong>Messenger · Julien</strong><p>On se cale un appel demain matin ?</p></div>
    </div>
  </div>
  <div class="taskbar">
    <span class="app"><img id="taskbar-icon" alt=""><img id="overlay" class="overlay" alt=""></span>
    <span class="tray">
      <span><svg viewBox="0 0 14 14"><path d="M3 9l4-4 4 4"/></svg></span>
      <span><img id="tray" alt=""></span>
      <span class="clock">18:42<br>13/10/2026</span>
    </span>
  </div>
  <script src="${pathToFileURL(path.join(UI, 'sidebar', 'badge-art.js'))}"></script>
  <script>
    const art = badgeArt.images('6', 'win32');
    document.getElementById('tray').src = art.tray.find((image) => image.scale === 2).dataURL;
    document.getElementById('overlay').src = art.overlay.find((image) => image.scale === 2).dataURL;
    document.getElementById('taskbar-icon').src = badgeArt.icon(48);
    document.getElementById('app-icon').src = badgeArt.icon(32);
  </script>
</body>
</html>`;
}

// Polices, images, puis deux images d'écran : la page est prête à capturer.
const SETTLED = `(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()`;

let state = null;
ipcMain.handle('hub:get-state', () => state);

// Une seule fenêtre, rendue hors écran en 2x : elle produit ses images sans être affichée.
async function shoot(win, file, width, height, load) {
  win.setContentSize(width, height);
  await load();
  await win.webContents.executeJavaScript(SETTLED);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(DOCS, file), image.toPNG());
  const size = image.getSize();
  console.log(`docs/${file} : ${size.width} × ${size.height} px`);
}

async function hubShot(win, file, width, height, dnd) {
  state = hubState(width, dnd);
  await shoot(win, file, width, height, async () => {
    await win.loadFile(path.join(UI, 'sidebar', 'index.html'), { query: { titlebar: '32' } });
    await win.webContents.executeJavaScript(`new Promise((resolve) => {
      const check = () => (document.querySelector('.account') ? resolve() : setTimeout(check, 20));
      check();
    })`);
    // La page interdit les styles en ligne : insertCSS passe outre.
    await win.webContents.insertCSS(PAGE_CSS);
    await win.webContents.executeJavaScript(`
      document.getElementById('stage').insertAdjacentHTML('beforeend', ${JSON.stringify(PAGE_HTML)});
      document.getElementById('titlebar').insertAdjacentHTML('beforeend', ${JSON.stringify(CAPTION_HTML)});
    0`);
  });
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(DOCS, { recursive: true });
    const win = new BrowserWindow({
      show: false,
      useContentSize: true,
      frame: false,
      backgroundColor: '#13151a',
      webPreferences: { offscreen: { deviceScaleFactor: 2 }, preload: path.join(ROOT, 'src', 'preload', 'sidebar.js'), sandbox: true },
    });
    await hubShot(win, 'apercu.png', 1280, 760, { on: false, label: 'Désactivé' });
    await hubShot(win, 'compact.png', 900, 640, { on: true, label: "Activé jusqu'à 18:00" });
    const page = path.join(TEMP, 'notification.html');
    fs.writeFileSync(page, notificationHtml());
    await shoot(win, 'notification.png', 560, 230, () => win.loadFile(page));
  } catch (error) {
    console.error(error);
    app.exit(1);
    return;
  }
  app.exit(0);
});
