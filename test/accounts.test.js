const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAccounts, newAccountId, moveAccount, placeAccount, ID_PATTERN } = require('../src/accounts');
const CATALOG = require('../src/services');

const byId = new Map(CATALOG.map((service) => [service.id, service]));

test('noms : numéro seulement quand une messagerie a plusieurs comptes, nom personnalisé prioritaire', () => {
  const accounts = resolveAccounts(
    [
      { id: 'whatsapp', service: 'whatsapp' },
      { id: 'discord', service: 'discord' },
      { id: 'whatsapp-abc', service: 'whatsapp' },
      { id: 'whatsapp-def', service: 'whatsapp', name: 'Boulot' },
      { id: 'icq', service: 'icq' },
    ],
    byId,
  );
  assert.deepEqual(
    accounts.map(({ id, name, number, shared }) => [id, name, number, shared]),
    [
      ['whatsapp', 'WhatsApp', 1, true],
      ['discord', 'Discord', 1, false],
      ['whatsapp-abc', 'WhatsApp 2', 2, true],
      ['whatsapp-def', 'Boulot', 3, true],
    ],
  );
});

test('nouvel id : jamais l’id nu de la messagerie, toujours valide et unique', () => {
  const id = newAccountId('whatsapp', ['whatsapp'], 1760000000000);
  assert.notEqual(id, 'whatsapp');
  assert.match(id, ID_PATTERN);
  assert.notEqual(newAccountId('whatsapp', [id], 1760000000000), id);
  assert.notEqual(newAccountId('telegram', [], 1), 'telegram');
});

test('réordonner', () => {
  const stored = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveAccount(stored, 'b', -1).map((x) => x.id), ['b', 'a', 'c']);
  assert.equal(moveAccount(stored, 'a', -1), stored);
  assert.deepEqual(placeAccount(stored, 'a', 'c', true).map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(placeAccount(stored, 'c', 'a', false).map((x) => x.id), ['c', 'a', 'b']);
  assert.equal(placeAccount(stored, 'a', 'zzz', false), stored);
});
