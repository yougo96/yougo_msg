// Pont des petites fenêtres de l'app (Diagnostic, Renommer). Chaque fenêtre n'a droit qu'à ses canaux.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set(['diag:snapshot', 'diag:copy', 'diag:open-logs', 'prompt:init', 'prompt:done']);

contextBridge.exposeInMainWorld('tool', {
  invoke: (channel, ...args) => (CHANNELS.has(channel) ? ipcRenderer.invoke(channel, ...args) : Promise.reject(new Error(`canal inconnu : ${channel}`))),
});
