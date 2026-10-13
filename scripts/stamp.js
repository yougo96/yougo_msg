// Avant `npm run dist` : note la date de publication de la version d'Electron embarquée.
// L'app s'en sert pour signaler, sans réseau, quand son Chromium vieillit (pas de mise à jour automatique).
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const version = require('electron/package.json').version;
let electronReleased = null;
try {
  const times = JSON.parse(execSync('npm view electron time --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  electronReleased = times[version] ?? null;
} catch {
  console.warn('stamp : date de publication d’Electron introuvable (hors ligne ?), rappel de mise à jour désactivé.');
}
const info = { electron: version, electronReleased, builtAt: new Date().toISOString() };
fs.writeFileSync(path.join(__dirname, '..', 'src', 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);
console.log(`stamp : Electron ${version}${electronReleased ? `, publié le ${electronReleased.slice(0, 10)}` : ''}`);
