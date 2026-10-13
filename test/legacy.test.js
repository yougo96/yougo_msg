const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { adoptProfile } = require('../src/legacy');

// Un dossier temporaire avec l'ancien profil (réglages + une session) et l'emplacement du nouveau.
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yougo-msg-legacy-'));
  const from = path.join(root, 'HP Message');
  const to = path.join(root, 'Yougo Msg');
  fs.mkdirSync(path.join(from, 'Partitions', 'whatsapp'), { recursive: true });
  fs.writeFileSync(path.join(from, 'settings.json'), '{"version":2}');
  fs.writeFileSync(path.join(from, 'Partitions', 'whatsapp', 'Cookies'), 'session');
  return { from, to };
}

test('ancien profil repris quand le nouveau dossier est absent ou vide', () => {
  for (const precreated of [false, true]) {
    const { from, to } = setup();
    if (precreated) fs.mkdirSync(to); // Electron crée le dossier avant main.js
    assert.equal(adoptProfile(from, to, 'win32'), 'moved');
    assert.equal(fs.readFileSync(path.join(to, 'Partitions', 'whatsapp', 'Cookies'), 'utf8'), 'session');
    assert.ok(!fs.existsSync(from));
  }
});

test('nouveau profil qui n’a jamais servi (caches seulement) : remplacé', () => {
  const { from, to } = setup();
  fs.mkdirSync(path.join(to, 'GPUCache'), { recursive: true });
  assert.equal(adoptProfile(from, to, 'win32'), 'moved');
  assert.ok(fs.existsSync(path.join(to, 'settings.json')));
});

test('nouveau profil déjà utilisé, ou rien à reprendre : on ne touche à rien', () => {
  for (const used of ['settings.json', 'Partitions']) {
    const { from, to } = setup();
    fs.mkdirSync(to);
    fs.mkdirSync(path.join(to, used));
    assert.equal(adoptProfile(from, to, 'win32'), 'none');
    assert.ok(fs.existsSync(path.join(from, 'settings.json')));
    assert.ok(fs.existsSync(path.join(to, used)));
  }
  const { from, to } = setup();
  fs.rmSync(path.join(from, 'settings.json'));
  assert.equal(adoptProfile(from, to, 'win32'), 'none');
  assert.ok(fs.existsSync(path.join(from, 'Partitions')));
});

test('Linux : ancienne app encore ouverte (verrou vivant), profil laissé en place', { skip: process.platform === 'win32' }, () => {
  const { from, to } = setup();
  fs.symlinkSync(`${os.hostname()}-${process.pid}`, path.join(from, 'SingletonLock'));
  assert.equal(adoptProfile(from, to, 'linux'), 'busy');
  assert.ok(fs.existsSync(path.join(from, 'settings.json')));
  fs.rmSync(path.join(from, 'SingletonLock'));
  fs.symlinkSync(`${os.hostname()}-999999999`, path.join(from, 'SingletonLock')); // verrou d'une app plantée
  assert.equal(adoptProfile(from, to, 'linux'), 'moved');
});
