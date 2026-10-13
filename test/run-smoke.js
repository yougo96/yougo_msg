// npm run smoke : lance l'app réelle avec un profil temporaire (jamais le vrai), exécute test/smoke.js,
// puis vérifie que le processus se termine vite après « Quitter » (piège du processus fantôme sous Windows).
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const QUIT_LIMIT_MS = 15000;
const TOTAL_LIMIT_MS = 240000;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'yougo-msg-smoke-'));
const out = process.env.YOUGO_MSG_SMOKE_OUT ?? profile;

// Cache des mises à jour (electron-updater) dans le profil de test, pas dans celui de l'app installée.
const cache = path.join(profile, 'cache');
const child = spawn(electron, [path.join(__dirname, 'smoke.js')], {
  env: { ...process.env, YOUGO_MSG_USER_DATA: path.join(profile, 'userData'), YOUGO_MSG_SMOKE_OUT: out, YOUGO_MSG_QUIET: '1', LOCALAPPDATA: cache, XDG_CACHE_HOME: cache },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let quitAt = null;
let summary = null;
const onLine = (line) => {
  if (line.startsWith('SMOKE ')) console.log(line);
  if (line.startsWith('SMOKE_RESULT ')) summary = JSON.parse(line.slice(13));
  if (line.startsWith('SMOKE_QUIT ')) quitAt = Date.now();
};
let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();
  lines.forEach(onLine);
});
child.stderr.on('data', () => {});

// Tue seulement le processus lancé par ce test (et ses enfants).
function kill() {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {}
}

const timer = setInterval(() => {
  if (quitAt && Date.now() - quitAt > QUIT_LIMIT_MS) {
    console.log(`SMOKE FAIL le processus ne s'est pas terminé ${QUIT_LIMIT_MS / 1000} s après Quitter (processus fantôme)`);
    kill();
  }
}, 500);
const overall = setTimeout(() => {
  console.log('SMOKE FAIL délai total dépassé');
  kill();
}, TOTAL_LIMIT_MS);

child.on('exit', (code) => {
  clearInterval(timer);
  clearTimeout(overall);
  const quitMs = quitAt ? Date.now() - quitAt : null;
  console.log(`SMOKE ${quitMs !== null && quitMs < QUIT_LIMIT_MS ? 'OK  ' : 'FAIL'} fermeture du processus${quitMs !== null ? ` : ${quitMs} ms` : ''} (code ${code})`);
  console.log(`Profil de test : ${profile}`);
  const ok = summary && summary.failed === 0 && quitMs !== null && quitMs < QUIT_LIMIT_MS;
  console.log(ok ? `Smoke test réussi (${summary.total} vérifications).` : 'Smoke test en échec.');
  process.exit(ok ? 0 : 1);
});
