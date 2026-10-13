// Icône près de l'horloge : pastille des non-lus, comptes en attente, mise à jour prête, ne pas déranger, quitter.
const { Menu, Tray, nativeImage } = require('electron');
const path = require('node:path');
const { badgeText } = require('./unread');
const updates = require('./updates');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

class AppTray {
  constructor(hub) {
    this.hub = hub;
    // Linux : Chromium prend la plus grande taille disponible ; Windows : 16 px à 100 %.
    const size = process.platform === 'linux' ? 64 : 32;
    this.fallbackImage = nativeImage.createFromPath(ICON).resize({ width: size, height: size, quality: 'best' });
    this.tray = new Tray(this.fallbackImage);
    this.tray.setToolTip('Yougo Msg');
    // Linux : « click » = activation (double-clic sous GNOME) ; le menu reste le chemin sûr.
    this.tray.on('click', () => hub.showWindow());
    this.signature = null;
    this.update(true);
  }

  update(force = false) {
    if (!this.tray || this.tray.isDestroyed()) return;
    const hub = this.hub;
    const { count, dot } = hub.summary();
    const waiting = hub.accounts
      .map((account) => ({ account, unread: hub.rt(account.id)?.unread }))
      .filter(({ account, unread }) => !account.muted && (unread?.count || unread?.dot));
    const signature = JSON.stringify([count, dot, waiting.map(({ account, unread }) => [account.id, account.name, unread.count, unread.dot]), hub.dndActive(), hub.dndLabel(), updates.trayItems().length && updates.state.version]);
    if (!force && signature === this.signature) return;
    this.signature = signature;

    this.tray.setImage(hub.trayImage() ?? this.fallbackImage);
    const status = count ? `${count} non lu${count > 1 ? 's' : ''}` : dot ? 'Nouveaux messages' : 'Rien de nouveau';
    this.tray.setToolTip(`Yougo Msg · ${status}${hub.dndActive() ? ' · ne pas déranger' : ''}`);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir Yougo Msg', click: () => hub.showWindow() },
        ...updates.trayItems(),
        { type: 'separator' },
        // Le compteur figure aussi dans le menu : certains bureaux Linux n'affichent pas l'infobulle.
        ...(waiting.length
          ? waiting.map(({ account, unread }) => ({
              label: `${account.name} · ${unread.count ? badgeText(unread.count) : 'nouveau'}`,
              click: () => {
                hub.showWindow();
                hub.select(account.id);
              },
            }))
          : [{ label: status, enabled: false }]),
        { type: 'separator' },
        { label: 'Ne pas déranger', submenu: hub.dndMenuItems() },
        { type: 'separator' },
        ...hub.settingsMenuItems(),
        { type: 'separator' },
        ...hub.toolsMenuItems(),
        { type: 'separator' },
        hub.quitMenuItem(),
      ]),
    );
  }

  destroy() {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }
}

module.exports = { AppTray };
