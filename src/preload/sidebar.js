// Pont minimal entre la barre latérale et le process principal (les messageries n'y ont pas accès).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  getState: () => ipcRenderer.invoke('hub:get-state'),
  select: (id) => ipcRenderer.send('hub:select', String(id)),
  accountMenu: (id) => ipcRenderer.send('hub:account-menu', String(id)),
  appMenu: () => ipcRenderer.send('hub:app-menu'),
  toggleDnd: () => ipcRenderer.send('hub:toggle-dnd'),
  dndMenu: () => ipcRenderer.send('hub:dnd-menu'),
  retry: (id) => ipcRenderer.send('hub:retry', String(id)),
  // Glisser-déposer : place le compte `id` avant ou après `targetId`.
  place: (id, targetId, position) => ipcRenderer.send('hub:place', String(id), String(targetId), position === 'after' ? 'after' : 'before'),
  // Images de la pastille (barre des tâches, zone de notification), dessinées ici car le process principal
  // n'a pas de canvas.
  badgeImages: (key, images) => ipcRenderer.send('hub:badge-images', String(key), images),
  onState: (callback) => ipcRenderer.on('hub:state', (_event, state) => callback(state)),
});
