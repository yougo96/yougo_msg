// Garde-fous du catalogue : ajouter une messagerie doit rester une entrée + une icône, sans erreur silencieuse.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CATALOG = require('../src/services');
const { hostMatches } = require('../src/policy');
const zlib = require('node:zlib');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');

// Lit un PNG sans dépendance : taille, type de couleur, et opacité des pixels de la première ligne (RGBA 8 bits).
function readPng(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.readUInt32BE(0), 0x89504e47, `${file} : pas un PNG`);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const colorType = data[25];
  const chunks = [];
  for (let offset = 8; offset < data.length; ) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  // Première ligne : la ligne « précédente » vaut zéro, seul le filtre Sub (1) ou Paeth/Avg (4/3) dépend de la gauche.
  const filter = raw[0];
  const row = Buffer.from(raw.subarray(1, 1 + width * 4));
  for (let i = 4; i < row.length && colorType === 6; i++) {
    if (filter === 1 || filter === 4) row[i] = (row[i] + row[i - 4]) & 0xff;
    else if (filter === 3) row[i] = (row[i] + (row[i - 4] >> 1)) & 0xff;
  }
  return { width, height, colorType, firstRowAlpha: (x) => row[x * 4 + 3] };
}

test('identité de l’app alignée avec package.json', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, new RegExp(`const APP_ID = '${pkg.build.appId.replace(/\./g, '\\.')}'`));
  assert.equal(pkg.desktopName, 'com.hp.message.desktop');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'linux.js'), 'utf8'), /DESKTOP_ID = 'com\.hp\.message'/);
});

test('chaque messagerie est complète et cohérente', () => {
  const ids = new Set();
  for (const service of CATALOG) {
    assert.match(service.id, /^[a-z0-9]+$/, service.id);
    assert.ok(!ids.has(service.id), `id en double : ${service.id}`);
    ids.add(service.id);
    assert.ok(service.name && service.color, service.id);
    const url = new URL(service.url);
    assert.equal(url.protocol, 'https:', service.id);
    assert.ok(hostMatches(url.hostname, service.hosts), `${service.id} : l'URL d'accueil doit être dans hosts`);
    for (const pattern of [...(service.popups ?? []), service.loggedOut, service.unread?.favicon].filter(Boolean)) assert.ok(pattern instanceof RegExp, service.id);
  }
});

test('icônes des messageries : 256 px au moins, fond transparent, tuile de notification', () => {
  for (const service of CATALOG) {
    const file = path.join(ROOT, 'src', 'ui', 'sidebar', 'icons', `${service.id}.png`);
    assert.ok(fs.existsSync(file), `${service.id} : icône manquante (assets/services/${service.id}.svg puis npm run icons)`);
    const icon = readPng(file);
    assert.ok(icon.width >= 256 && icon.height >= 256, `${service.id} : icône de ${icon.width}x${icon.height}, 256 px au moins`);
    assert.equal(icon.colorType, 6, `${service.id} : icône sans canal alpha`);
    assert.equal(icon.firstRowAlpha(0), 0, `${service.id} : coin opaque (fond plein)`);
    assert.equal(icon.firstRowAlpha(icon.width - 1), 0, `${service.id} : coin opaque (fond plein)`);
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'services', `${service.id}.png`)), `${service.id} : tuile de notification manquante`);
  }
});

test('les lectures de page sont autonomes (elles sont sérialisées puis exécutées dans la page)', () => {
  for (const service of CATALOG.filter((entry) => entry.unread?.page)) {
    const source = service.unread.page.toString();
    // Recréée hors de son module : une variable du catalogue utilisée par erreur ferait une ReferenceError.
    const probe = new Function(`return (${source})`)();
    const fakeDocument = { querySelector: () => null, querySelectorAll: () => [] };
    const result = new Function('document', `return (${source})()`)(fakeDocument);
    assert.equal(typeof probe, 'function');
    assert.equal(result, null, `${service.id} : page pas prête = null`);
  }
});
