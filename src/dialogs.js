// Petite fenêtre de saisie (Electron n'a pas d'équivalent de prompt()). Renvoie le texte, ou null si annulé.
const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let current = null; // une seule à la fois

function prompt(parent, { title, label, value = '', placeholder = '' }) {
  if (current) {
    current.win.focus();
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      parent,
      modal: true,
      width: 420,
      height: 170,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title,
      show: false,
      backgroundColor: '#1d2027',
      webPreferences: { preload: path.join(__dirname, 'preload', 'tool.js'), sandbox: true, contextIsolation: true },
    });
    win.removeMenu();
    current = { win, label, value, placeholder, resolve };
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      if (current?.win === win) {
        current = null;
        resolve(null);
      }
    });
    win.loadFile(path.join(__dirname, 'ui', 'prompt', 'index.html'));
  });
}

const fromCurrent = (event) => current && event.sender === current.win.webContents;

ipcMain.handle('prompt:init', (event) => (fromCurrent(event) ? { label: current.label, value: current.value, placeholder: current.placeholder } : null));
ipcMain.handle('prompt:done', (event, value) => {
  if (!fromCurrent(event)) return;
  const { win, resolve } = current;
  current = null;
  resolve(typeof value === 'string' ? value : null);
  win.close();
});

module.exports = { prompt };
