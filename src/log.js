// Journal local (<userData>/logs/hp-message.log), pour répondre aux questions ouvertes du playbook.
// Il ne contient jamais le texte des messages : des comptes, des nombres, des événements. Rien ne sort de la machine.

const fs = require('node:fs');
const path = require('node:path');

const MAX_SIZE = 1024 * 1024;

function createLog(dir) {
  const file = path.join(dir, 'hp-message.log');
  let size = null;

  function rotate() {
    try {
      fs.rmSync(`${file}.1`, { force: true });
      fs.renameSync(file, `${file}.1`);
    } catch {}
    size = 0;
  }

  function write(level, message) {
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}\n`;
    try {
      if (!process.env.HP_MESSAGE_QUIET) process.stdout.write(line);
    } catch {}
    try {
      if (size === null) {
        fs.mkdirSync(dir, { recursive: true });
        size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      }
      if (size > MAX_SIZE) rotate();
      fs.appendFileSync(file, line);
      size += Buffer.byteLength(line);
    } catch {}
  }

  const log = (level, message) => write(level, message);
  log.file = file;
  log.dir = dir;
  return log;
}

module.exports = { createLog };
