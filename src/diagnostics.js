// Fenêtre « Diagnostic » et relevé mémoire périodique : de quoi répondre aux questions ouvertes du playbook
// (compteurs fiables ? notifications reçues ? mémoire supportable ?) avec des chiffres. Tout reste local.
const { BrowserWindow, app, clipboard, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { titleBarOptions, pageQuery } = require('./titlebar');
const views = require('./views');
const updates = require('./updates');

const MEMORY_LOG_INTERVAL = 15 * 60e3;
const ELECTRON_OLD_DAYS = 60;
let win = null;

// Chromium ne se met à jour qu'avec une nouvelle version de l'app : on signale quand l'Electron embarqué vieillit.
function buildInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8'));
  } catch {
    return null;
  }
}

function electronAge() {
  const released = Date.parse(buildInfo()?.electronReleased ?? '');
  return Number.isFinite(released) ? Math.floor((Date.now() - released) / 86400e3) : null;
}

// Mémoire par compte : processus de la page et de ses iframes, plus ses fenêtres d'appel.
// Windows : mémoire privée ; Linux : mémoire résidente (surestimée, elle compte les pages partagées).
function memory(hub) {
  const metrics = new Map(app.getAppMetrics().map((metric) => [metric.pid, metric]));
  const kb = (metric) => metric.memory.privateBytes ?? metric.memory.workingSetSize;
  const claimed = new Set();
  const perAccount = new Map();
  for (const account of hub.accounts) {
    const pids = new Set();
    for (const wc of hub.rt(account.id)?.webContents() ?? []) {
      try {
        for (const frame of wc.mainFrame.framesInSubtree) if (frame.osProcessId) pids.add(frame.osProcessId);
      } catch {}
    }
    let total = 0;
    let cpu = 0;
    for (const pid of pids) {
      const metric = metrics.get(pid);
      if (!metric || claimed.has(pid)) continue;
      claimed.add(pid);
      total += kb(metric);
      cpu += metric.cpu.percentCPUUsage;
    }
    perAccount.set(account.id, { mb: Math.round(total / 1024), cpu: Math.round(cpu * 10) / 10, processes: pids.size });
  }
  const shared = [...metrics.values()]
    .filter((metric) => !claimed.has(metric.pid))
    .map((metric) => ({ name: metric.name || metric.type, mb: Math.round(kb(metric) / 1024) }));
  const totalMb = [...perAccount.values()].reduce((sum, entry) => sum + entry.mb, 0) + shared.reduce((sum, entry) => sum + entry.mb, 0);
  return { perAccount, shared, totalMb, kind: process.platform === 'win32' ? 'privée' : 'résidente' };
}

async function snapshot(hub) {
  const mem = memory(hub);
  const peaks = (hub.memoryPeaks ??= new Map());
  const accounts = await Promise.all(
    hub.accounts.map(async (account) => {
      const rt = hub.rt(account.id);
      const wc = hub.views.get(account.id)?.webContents;
      let visibility = '?';
      try {
        visibility = wc && !wc.isDestroyed() ? wc.mainFrame.visibilityState : '?';
      } catch {}
      const usage = mem.perAccount.get(account.id);
      peaks.set(account.id, Math.max(peaks.get(account.id) ?? 0, usage?.mb ?? 0));
      return {
        id: account.id,
        name: account.name,
        status: views.displayStatus(rt),
        muted: Boolean(account.muted),
        unread: rt?.unread ?? null,
        title: rt?.title ?? '',
        favicon: rt?.favicons?.[0] ?? '',
        probe: rt?.probe ?? null,
        url: rt?.url ?? '',
        visibility,
        audioMuted: wc && !wc.isDestroyed() ? wc.isAudioMuted() : false,
        notifications: rt?.stats ?? null,
        crashes: rt?.crashes.length ?? 0,
        error: rt?.error ?? null,
        memory: usage ?? null,
        peakMb: peaks.get(account.id),
      };
    }),
  );
  const system = process.getSystemMemoryInfo();
  const info = buildInfo();
  return {
    version: app.getVersion(),
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    electronAgeDays: electronAge(),
    electronOld: (electronAge() ?? 0) > ELECTRON_OLD_DAYS,
    builtAt: info?.builtAt ?? null,
    update: updates.describe(),
    platform: `${process.platform} ${process.getSystemVersion()}`,
    uptimeMin: Math.round(process.uptime() / 60),
    dnd: hub.dndLabel(),
    trayAvailable: hub.trayAvailable,
    userData: app.getPath('userData'),
    accounts,
    shared: mem.shared,
    totalMb: mem.totalMb,
    memoryKind: mem.kind,
    systemMb: Math.round(system.total / 1024),
  };
}

// Relevé toutes les 15 min dans le journal : une semaine de relevés répond à « la mémoire reste-t-elle supportable ».
function startMemoryLog(hub) {
  const record = () => {
    try {
      const mem = memory(hub);
      const parts = hub.accounts.map((account) => `${account.id}=${mem.perAccount.get(account.id)?.mb ?? 0}`);
      hub.log('info', `mémoire ${mem.kind} totale=${mem.totalMb} Mo ${parts.join(' ')}`);
    } catch {}
  };
  setTimeout(record, 5 * 60e3);
  setInterval(record, MEMORY_LOG_INTERVAL);
}

function openWindow(hub) {
  if (win && !win.isDestroyed()) return win.focus();
  win = new BrowserWindow({
    width: 980,
    height: 640,
    title: 'Yougo Msg · Diagnostic',
    ...titleBarOptions,
    backgroundColor: '#13151a',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload', 'tool.js'), sandbox: true, contextIsolation: true },
  });
  win.removeMenu();
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('closed', () => (win = null));
  win.loadFile(path.join(__dirname, 'ui', 'diagnostics', 'index.html'), { query: pageQuery });
}

function register(hub) {
  const fromWindow = (event) => win && !win.isDestroyed() && event.sender === win.webContents;
  ipcMain.handle('diag:snapshot', (event) => (fromWindow(event) ? snapshot(hub) : null));
  ipcMain.handle('diag:copy', (event, text) => (fromWindow(event) && typeof text === 'string' ? clipboard.writeText(text) : null));
  ipcMain.handle('diag:open-logs', (event) => (fromWindow(event) ? shell.openPath(hub.log.dir) : null));
  startMemoryLog(hub);
}

module.exports = { register, openWindow, electronAge, ELECTRON_OLD_DAYS };
