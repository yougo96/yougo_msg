// Préférences persistées dans <userData>/settings.json. Sans dépendance à Electron (testé dans test/).
//
// Écriture atomique (fichier temporaire puis renommage) avec une copie de secours : un arrêt brutal ne doit
// jamais faire perdre la liste des comptes, donc leurs sessions.

const fs = require('node:fs');
const path = require('node:path');
const { ID_PATTERN, defaultAccounts } = require('./accounts');

const VERSION = 2;
const SAVE_DELAY = 400;

function defaults(catalog) {
  return {
    version: VERSION,
    accounts: defaultAccounts(catalog),
    activeId: null,
    dnd: false,
    dndUntil: null, // horodatage de fin, ou null = jusqu'à réactivation
    discreet: false, // barre latérale masquée (Ctrl+D)
    closeToTray: true,
    window: null, // { width, height, x, y, maximized }
    autostartInitialized: false,
    trayHintShown: false,
    pendingPartitionDeletes: [], // partitions des comptes retirés, effacées au démarrage suivant
  };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => (Number.isFinite(value) ? value : undefined);

// Un compte d'une messagerie retirée du catalogue est gardé tel quel (accounts.js ne l'affiche pas).
function normalizeAccount(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) return null;
  if (typeof raw.service !== 'string' || !raw.service) return null;
  const account = { id: raw.id, service: raw.service };
  if (typeof raw.name === 'string' && raw.name.trim()) account.name = raw.name.trim().slice(0, 40);
  if (raw.muted === true) account.muted = true;
  if (raw.sleep === true) account.sleep = true;
  if (finite(raw.zoom) && raw.zoom !== 0) account.zoom = Math.max(-5, Math.min(5, raw.zoom));
  if (raw.userAgent === 'electron') account.userAgent = 'electron';
  return account;
}

function normalize(raw, catalog) {
  const base = defaults(catalog);
  if (!isObject(raw)) return base;
  const settings = { ...base };
  if (Array.isArray(raw.accounts)) {
    const ids = new Set();
    settings.accounts = raw.accounts
      .map(normalizeAccount)
      .filter((account) => account && !ids.has(account.id) && ids.add(account.id));
  }
  if (typeof raw.activeId === 'string') settings.activeId = raw.activeId;
  settings.dnd = raw.dnd === true;
  settings.dndUntil = settings.dnd && finite(raw.dndUntil) ? raw.dndUntil : null;
  settings.discreet = raw.discreet === true;
  if (typeof raw.closeToTray === 'boolean') settings.closeToTray = raw.closeToTray;
  if (isObject(raw.window) && finite(raw.window.width) && finite(raw.window.height)) {
    const { width, height, x, y, maximized } = raw.window;
    settings.window = { width, height, maximized: maximized === true };
    if (finite(x) !== undefined && finite(y) !== undefined) Object.assign(settings.window, { x, y });
  }
  settings.autostartInitialized = raw.autostartInitialized === true;
  settings.trayHintShown = raw.trayHintShown === true;
  if (Array.isArray(raw.pendingPartitionDeletes)) {
    settings.pendingPartitionDeletes = raw.pendingPartitionDeletes.filter((id) => typeof id === 'string' && ID_PATTERN.test(id));
  }
  return settings;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Renommer peut échouer un instant sous Windows (antivirus, indexation) : on réessaie.
function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  renameWithRetry(tmp, file);
}

class SettingsStore {
  constructor(file, catalog, log = () => {}) {
    this.file = file;
    this.backup = `${file}.bak`;
    this.catalog = catalog;
    this.log = log;
    this.timer = null;
    this.data = this.load();
  }

  load() {
    for (const candidate of [this.file, this.backup]) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const data = normalize(readJson(candidate), this.catalog);
        if (candidate === this.backup) this.log('warn', 'settings.json illisible, copie de secours utilisée');
        return data;
      } catch (error) {
        // On met le fichier abîmé de côté au lieu de l'écraser : il reste récupérable à la main.
        const aside = `${candidate}.corrupt-${Date.now()}`;
        try {
          fs.renameSync(candidate, aside);
        } catch {}
        this.log('error', `réglages illisibles (${path.basename(candidate)}) : ${error.message}`);
      }
    }
    return defaults(this.catalog);
  }

  // Enregistrement différé : plusieurs changements rapprochés = une seule écriture.
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup);
      writeAtomic(this.file, JSON.stringify(this.data, null, 2));
    } catch (error) {
      this.log('error', `réglages non enregistrés : ${error.message}`);
    }
  }
}

module.exports = { SettingsStore, normalize, defaults, VERSION };
