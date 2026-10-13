// Garde-fous du catalogue : ajouter une messagerie doit rester une entrée + une icône, sans erreur silencieuse.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CATALOG = require('../src/services');
const { hostMatches } = require('../src/policy');
const pkg = require('../package.json');

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
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'ui', 'sidebar', 'icons', `${service.id}.png`)), `${service.id} : icône manquante`);
    for (const pattern of [...(service.popups ?? []), service.loggedOut, service.unread?.favicon].filter(Boolean)) assert.ok(pattern instanceof RegExp, service.id);
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
