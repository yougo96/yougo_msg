// Garde-fous des mises à jour : une erreur ici ne se verrait qu'une fois la release publiée, sur les apps installées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');

test('electron-updater embarqué dans l’app', () => {
  // En devDependencies, electron-builder ne le mettrait pas dans l'app : aucune mise à jour, sans erreur visible.
  assert.ok(pkg.dependencies?.['electron-updater'], 'electron-updater doit être dans dependencies');
  assert.ok(!pkg.devDependencies?.['electron-updater']);
});

test('les releases sont publiées sur le dépôt de l’app', () => {
  const publish = pkg.build.publish;
  assert.equal(publish.provider, 'github');
  assert.equal(`github:${publish.owner}/${publish.repo}`, pkg.repository);
  // Brouillon jusqu'à ce que Windows et Linux soient construits (.github/workflows/release.yml).
  assert.equal(publish.releaseType, 'draft');
});

test('un tag vx.y.z déclenche la release', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.match(workflow, /--publish always/);
  assert.match(workflow, /rpmbuild/);
  assert.match(fs.readFileSync(path.join(ROOT, '.npmrc'), 'utf8'), /^message = "chore: version %s"$/m);
});

test('Linux : chaque format installé trouve sa mise à jour dans la release', () => {
  // electron-updater cherche le même format que celui installé : un format retiré laisserait ses apps sans mise à jour.
  assert.deepEqual(pkg.build.linux.target, ['deb', 'rpm', 'AppImage']);
});
