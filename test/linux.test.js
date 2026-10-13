const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execArg, desktopEntry, escapeMarkup } = require('../src/linux');

test('Exec des fichiers .desktop : guillemets et échappements freedesktop', () => {
  assert.equal(execArg('/usr/bin/hp-message'), '/usr/bin/hp-message');
  assert.equal(execArg('/opt/HP Message/hp-message'), '"/opt/HP Message/hp-message"');
  assert.equal(execArg('--hidden'), '--hidden');
  assert.equal(execArg('/home/a/100%.AppImage'), '/home/a/100%%.AppImage');
  assert.equal(execArg('/home/a b/$x'), '"/home/a b/\\\\$x"');
});

test('entrée de démarrage', () => {
  const text = desktopEntry({ name: 'HP Message', comment: 'c', argv: ['/opt/HP Message/hp-message', '--hidden'], icon: 'com.hp.message' });
  assert.match(text, /^\[Desktop Entry\]\n/);
  assert.match(text, /\nExec="\/opt\/HP Message\/hp-message" --hidden\n/);
});

test('texte des notifications Linux : balisage neutralisé', () => {
  assert.equal(escapeMarkup('Tom & Jerry <3'), 'Tom &amp; Jerry &lt;3');
});
