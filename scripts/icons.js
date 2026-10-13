// Régénère les icônes de l'app depuis le dessin de src/ui/sidebar/badge-art.js (npm run icons) :
//   assets/icon.png  1024 px : Linux (.deb, AppImage), notifications de l'app ;
//   assets/icon.ico  Windows : fenêtres, barre des tâches, installeur ; une image dessinée par taille, nette en petit ;
//   assets/badge.png pastille de secours de la barre des tâches ;
// et, pour chaque messagerie, depuis assets/services/<id>.svg (tracé de la marque, dans sa couleur) :
//   src/ui/sidebar/icons/<id>.png  256 px, fond transparent : barre latérale ;
//   assets/services/<id>.png       256 px, sur une tuile sombre : notifications (lisible sur fond clair comme sombre).
// Lancé par Electron (il faut un canvas), avec un profil temporaire.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SERVICES = path.join(ASSETS, 'services');
const SIDEBAR_ICONS = path.join(ROOT, 'src', 'ui', 'sidebar', 'icons');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const SERVICE_SIZE = 256;

// Exécuté dans la page : dessine un SVG à `size` px, seul (marge de 4 %) ou au centre d'une tuile de la DA.
const DRAW_SERVICE = `window.drawService = async (svg, size, tile) => {
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (tile) {
    ctx.fillStyle = '#13151a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = size / 85;
    ctx.strokeRect(size * 0.047, size * 0.047, size * 0.906, size * 0.906);
  }
  const glyph = Math.round(size * (tile ? 0.6 : 0.92));
  const offset = (size - glyph) / 2;
  ctx.drawImage(image, offset, offset, glyph, glyph);
  return canvas.toDataURL('image/png');
};0`;

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'yougo-msg-icons-')));

// Fichier .ico dont chaque image est un PNG (accepté depuis Windows Vista).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // plans
    entry.writeUInt16LE(32, 6); // bits par pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>icônes</title>');
    // « ;0 » : le script se termine par un objet de fonctions, que executeJavaScript ne saurait renvoyer.
    await win.webContents.executeJavaScript(`${fs.readFileSync(path.join(ROOT, 'src', 'ui', 'sidebar', 'badge-art.js'), 'utf8')};0`);
    const png = async (expression) => Buffer.from((await win.webContents.executeJavaScript(expression)).split(',')[1], 'base64');

    fs.writeFileSync(path.join(ASSETS, 'icon.png'), await png('badgeArt.icon(1024)'));
    const images = [];
    for (const size of ICO_SIZES) images.push({ size, png: await png(`badgeArt.icon(${size})`) });
    fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico(images));
    fs.writeFileSync(path.join(ASSETS, 'badge.png'), await png('badgeArt.badge(32)'));
    console.log(`Icônes régénérées dans ${path.relative(ROOT, ASSETS)} : icon.png, icon.ico (${ICO_SIZES.join(', ')} px), badge.png`);

    await win.webContents.executeJavaScript(DRAW_SERVICE);
    const ids = fs.readdirSync(SERVICES).filter((name) => name.endsWith('.svg')).map((name) => path.basename(name, '.svg'));
    for (const id of ids) {
      const svg = JSON.stringify(fs.readFileSync(path.join(SERVICES, `${id}.svg`), 'utf8'));
      fs.writeFileSync(path.join(SIDEBAR_ICONS, `${id}.png`), await png(`drawService(${svg}, ${SERVICE_SIZE}, false)`));
      fs.writeFileSync(path.join(SERVICES, `${id}.png`), await png(`drawService(${svg}, ${SERVICE_SIZE}, true)`));
    }
    console.log(`Icônes des messageries régénérées (${SERVICE_SIZE} px) : ${ids.join(', ')}`);
  } catch (error) {
    console.error(error);
    app.exit(1);
    return;
  }
  app.exit(0);
});
