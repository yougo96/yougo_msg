const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore, normalize, defaults } = require('../src/settings');
const CATALOG = require('../src/services');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'yougo-msg-test-'));

test('premier lancement : un compte par messagerie activée, id = id de la messagerie', () => {
  const settings = defaults(CATALOG);
  assert.deepEqual(
    settings.accounts.map((account) => account.id),
    ['messenger', 'whatsapp', 'instagram', 'snapchat', 'googlechat', 'googlemessages', 'discord'],
  );
});

test('reprise des réglages du POC : mêmes ids de compte (donc mêmes sessions)', () => {
  const poc = {
    activeId: 'whatsapp-mgk3x1',
    doNotDisturb: true,
    muted: ['discord', 'whatsapp-mgk3x1'],
    extraAccounts: [{ id: 'whatsapp-mgk3x1', service: 'whatsapp' }],
    trayHintShown: true,
  };
  const settings = normalize(poc, CATALOG);
  assert.deepEqual(
    settings.accounts.map((account) => account.id),
    ['messenger', 'whatsapp', 'whatsapp-mgk3x1', 'instagram', 'snapchat', 'googlechat', 'googlemessages', 'discord'],
  );
  assert.equal(settings.accounts.find((account) => account.id === 'discord').muted, true);
  assert.equal(settings.accounts.find((account) => account.id === 'whatsapp-mgk3x1').muted, true);
  assert.equal(settings.activeId, 'whatsapp-mgk3x1');
  assert.equal(settings.dnd, true);
  assert.equal(settings.dndUntil, null);
  assert.equal(settings.trayHintShown, true);
});

test('réglages abîmés ou farfelus : normalisés sans planter', () => {
  const settings = normalize(
    {
      version: 2,
      accounts: [{ id: 'whatsapp', service: 'whatsapp', zoom: 99, name: '  Pro  ' }, { id: 'whatsapp', service: 'whatsapp' }, { id: '../evil', service: 'x' }, 'n/a', { id: 'oldie', service: 'icq' }],
      muted: 'oui',
      dnd: 'yes',
      window: { width: 'big' },
      pendingPartitionDeletes: ['ok-1', '..\\..\\Windows'],
    },
    CATALOG,
  );
  assert.deepEqual(settings.accounts, [
    { id: 'whatsapp', service: 'whatsapp', name: 'Pro', zoom: 5 },
    { id: 'oldie', service: 'icq' }, // messagerie retirée du catalogue : gardée, pas affichée
  ]);
  assert.equal(settings.dnd, false);
  assert.equal(settings.window, null);
  assert.deepEqual(settings.pendingPartitionDeletes, ['ok-1']);
});

test('enregistrement atomique, avec copie de secours relue si le fichier est abîmé', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  const store = new SettingsStore(file, CATALOG);
  store.data.activeId = 'discord';
  store.flush();
  store.data.activeId = 'whatsapp';
  store.flush();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).activeId, 'whatsapp');
  assert.equal(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).activeId, 'discord');

  fs.writeFileSync(file, '{"version": 2, "accounts": [');
  const logs = [];
  const reloaded = new SettingsStore(file, CATALOG, (level, message) => logs.push(level, message));
  assert.equal(reloaded.data.activeId, 'discord');
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith('settings.json.corrupt-')), 'le fichier abîmé est mis de côté');
  assert.ok(logs.includes('error'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('les valeurs par défaut ne sont jamais partagées entre deux chargements', () => {
  const a = defaults(CATALOG);
  a.accounts.push({ id: 'x', service: 'whatsapp' });
  assert.equal(defaults(CATALOG).accounts.length, 7);
});
