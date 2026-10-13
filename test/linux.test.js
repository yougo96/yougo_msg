const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execArg, desktopEntry, escapeMarkup } = require('../src/linux');

test('Exec des fichiers .desktop : guillemets et échappements freedesktop', () => {
  assert.equal(execArg('/usr/bin/yougo-msg'), '/usr/bin/yougo-msg');
  assert.equal(execArg('/opt/Yougo Msg/yougo-msg'), '"/opt/Yougo Msg/yougo-msg"');
  assert.equal(execArg('--hidden'), '--hidden');
  assert.equal(execArg('/home/a/100%.AppImage'), '/home/a/100%%.AppImage');
  assert.equal(execArg('/home/a b/$x'), '"/home/a b/\\\\$x"');
});

test('entrée de démarrage', () => {
  const text = desktopEntry({ name: 'Yougo Msg', comment: 'c', argv: ['/opt/Yougo Msg/yougo-msg', '--hidden'], icon: 'com.yougo.msg' });
  assert.match(text, /^\[Desktop Entry\]\n/);
  assert.match(text, /\nExec="\/opt\/Yougo Msg\/yougo-msg" --hidden\n/);
});

test('texte des notifications Linux : balisage neutralisé', () => {
  assert.equal(escapeMarkup('Tom & Jerry <3'), 'Tom &amp; Jerry &lt;3');
});
