// Cœur de l'app : la fenêtre, les comptes et leurs vues, la sélection, ne pas déranger, les indicateurs.
const { BrowserWindow, Menu, app, dialog, nativeImage, screen, shell } = require('electron');
const path = require('node:path');
const { resolveAccounts, newAccountId, moveAccount, placeAccount } = require('./accounts');
const { summarize, badgeText } = require('./unread');
const { Notifier } = require('./notifications');
const views = require('./views');
const autostart = require('./autostart');
const { prompt } = require('./dialogs');
const { TITLE_BAR_HEIGHT, titleBarOptions, pageQuery } = require('./titlebar');

// Barre latérale en liste ; en dessous de COMPACT_BELOW px de large, la fenêtre la replie en colonne d'icônes :
// la liste ne s'affiche que si la page garde au moins ~950 px.
const SIDEBAR_WIDTH = 248;
const SIDEBAR_COMPACT_WIDTH = 72;
const COMPACT_BELOW = 1200;
const ASSETS = path.join(__dirname, '..', 'assets');
const SIDEBAR_HTML = path.join(__dirname, 'ui', 'sidebar', 'index.html');
const SIDEBAR_PRELOAD = path.join(__dirname, 'preload', 'sidebar.js');
// Windows : .ico à plusieurs tailles, net dans la barre de titre et la barre des tâches.
const APP_ICON = path.join(ASSETS, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
// Une vue en erreur est masquée : la barre latérale affiche à sa place l'état et un bouton « Réessayer ».
const HIDDEN_STATUSES = new Set(['offline', 'crashed']);
// Après un chargement, la page met du temps à afficher ses non-lus : une hausse pendant ce délai n'est pas un nouveau message.
const SETTLE_DELAY = 60e3;

// « Jusqu'à demain 8 h » choisi en pleine nuit vise ce matin, pas le lendemain.
function nextMorning(now = new Date()) {
  const morning = new Date(now);
  morning.setHours(now.getHours() < 5 ? 8 : 24 + 8, 0, 0, 0);
  return morning.getTime();
}

class Hub {
  constructor({ catalog, store, log, userAgents }) {
    this.catalog = catalog;
    this.catalogById = new Map(catalog.map((service) => [service.id, service]));
    this.store = store;
    this.prefs = store.data;
    this.log = log;
    this.userAgents = userAgents;
    this.accounts = [];
    this.views = new Map(); // id du compte -> WebContentsView
    this.runtime = new Map(); // id du compte -> état vivant (voir views.js)
    this.win = null;
    this.tray = null; // posé par main.js
    this.trayAvailable = true;
    this.quitting = false;
    this.fullscreenId = null;
    this.badgeImages = new Map(); // clé de pastille -> { tray, overlay } (nativeImage)
    this.indicatorKey = null;
    this.firstShow = true;
    this.notifier = new Notifier(this);
    this.dndTimer = null;
    this.stateQueued = false;
  }

  save() {
    this.store.save();
  }

  account(id) {
    return this.accounts.find((account) => account.id === id) ?? null;
  }

  rt(id) {
    return this.runtime.get(id) ?? null;
  }

  // Compte d'une webContents : une vue de compte ou une fenêtre ouverte par elle.
  accountForWebContents(wc) {
    for (const [id, rt] of this.runtime) if (rt.wcIds.has(wc.id)) return this.account(id);
    return null;
  }

  // ---------------------------------------------------------------- fenêtre

  createWindow() {
    const saved = this.prefs.window;
    const bounds = { width: 1400, height: 900 };
    if (saved) {
      Object.assign(bounds, { width: saved.width, height: saved.height });
      const onScreen = screen.getAllDisplays().some(({ workArea: area }) => saved.x !== undefined && saved.x < area.x + area.width - 100 && saved.x + saved.width > area.x + 100 && saved.y >= area.y - 10 && saved.y < area.y + area.height - 100);
      if (onScreen) Object.assign(bounds, { x: saved.x, y: saved.y });
    }
    const win = new BrowserWindow({
      ...bounds,
      minWidth: 720,
      minHeight: 480,
      title: 'Yougo Msg',
      icon: APP_ICON,
      ...titleBarOptions,
      backgroundColor: '#13151a',
      show: false,
      webPreferences: { preload: SIDEBAR_PRELOAD, sandbox: true, contextIsolation: true, spellcheck: false },
    });
    this.win = win;
    win.removeMenu();
    win.loadFile(SIDEBAR_HTML, { query: pageQuery });
    // La barre latérale ne navigue jamais (un fichier déposé dessus la remplacerait).
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('before-input-event', (event, input) => this.handleShortcut(event, input));

    const layout = () => this.layout();
    win.contentView.on('bounds-changed', layout);
    for (const event of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(event, layout);
    for (const event of ['resize', 'move', 'maximize', 'unmaximize']) win.on(event, () => this.rememberBounds());
    win.on('focus', () => {
      win.flashFrame(false);
      this.focusActive();
    });
    for (const event of ['show', 'hide', 'minimize', 'restore']) {
      win.on(event, () => {
        this.updateAllAudio();
        this.pushState();
      });
    }

    // Fermer la fenêtre ne quitte pas : les messageries continuent de recevoir en arrière-plan.
    win.on('close', (event) => {
      if (this.quitting) return;
      event.preventDefault();
      if (this.trayAvailable && this.prefs.closeToTray) {
        win.hide();
        this.showTrayHint();
      } else {
        win.minimize();
      }
    });
    // Windows : à la fermeture de session, ni before-quit ni will-quit ne sont émis.
    win.on('session-end', () => {
      this.quitting = true;
      this.store.flush();
      for (const view of this.views.values()) if (!view.webContents.isDestroyed()) view.webContents.close();
    });
    return win;
  }

  rememberBounds() {
    const win = this.win;
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized() || win.isFullScreen()) return;
    const bounds = win.getNormalBounds(); // taille « restaurée », même quand la fenêtre est agrandie
    this.prefs.window = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, maximized: win.isMaximized() };
    this.save();
  }

  showWindow() {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    if (this.firstShow) {
      this.firstShow = false;
      if (this.prefs.window?.maximized) win.maximize();
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  showTrayHint() {
    if (this.prefs.trayHintShown) return;
    this.prefs.trayHintShown = true;
    this.save();
    const where = process.platform === 'linux' ? 'son icône près de l’horloge (double-clic ou clic droit)' : 'son icône près de l’horloge (clic droit)';
    this.notifier.info('Yougo Msg reste ouvert', `Il continue de recevoir vos messages. Pour le rouvrir ou le quitter : ${where}.`);
  }

  layout() {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const [width, height] = win.getContentSize();
    const sidebar = this.sidebarWidth();
    // Sous Windows, la bande de titre de la barre latérale reste visible au-dessus de la page.
    const normal = { x: sidebar, y: TITLE_BAR_HEIGHT, width: Math.max(0, width - sidebar), height: Math.max(0, height - TITLE_BAR_HEIGHT) };
    const full = { x: 0, y: 0, width, height };
    for (const [id, view] of this.views) view.setBounds(id === this.fullscreenId ? full : normal);
    if (sidebar !== this.shownSidebarWidth) {
      this.shownSidebarWidth = sidebar;
      this.pushState();
    }
  }

  sidebarWidth() {
    const width = this.win && !this.win.isDestroyed() ? this.win.getContentSize()[0] : 0;
    return width && width < COMPACT_BELOW ? SIDEBAR_COMPACT_WIDTH : SIDEBAR_WIDTH;
  }

  setFullscreenAccount(id) {
    this.fullscreenId = id;
    this.layout();
  }

  // ---------------------------------------------------------------- comptes et vues

  // Crée les vues des nouveaux comptes et détruit celles des comptes retirés.
  sync() {
    this.accounts = resolveAccounts(this.prefs.accounts, this.catalogById);
    for (const account of this.accounts) if (!this.views.has(account.id)) views.create(this, account);
    for (const id of [...this.views.keys()]) if (!this.account(id)) views.destroy(this, id);
    if (!this.account(this.prefs.activeId)) this.prefs.activeId = this.accounts[0]?.id ?? null;
    this.layout();
    this.updateViews();
    this.pushState();
  }

  shouldShow(id) {
    return id === this.prefs.activeId && !HIDDEN_STATUSES.has(this.rt(id)?.status);
  }

  // Une vue masquée est « hidden » pour la page : ses messages ne sont pas marqués comme lus.
  // On affiche la nouvelle avant de masquer l'ancienne, sans jamais en recouvrir une autre.
  updateViews() {
    for (const [id, view] of this.views) if (this.shouldShow(id)) view.setVisible(true);
    for (const [id, view] of this.views) if (!this.shouldShow(id)) view.setVisible(false);
  }

  focusActive() {
    const view = this.views.get(this.prefs.activeId);
    if (view && this.shouldShow(this.prefs.activeId) && !view.webContents.isDestroyed()) view.webContents.focus();
  }

  select(id) {
    if (!this.account(id)) return;
    const changed = this.prefs.activeId !== id;
    this.prefs.activeId = id;
    if (changed) this.save();
    views.ensureLoaded(this, id);
    this.updateViews();
    this.focusActive();
    this.updateAllAudio();
    this.pushState();
  }

  selectRelative(delta) {
    const index = this.accounts.findIndex((account) => account.id === this.prefs.activeId);
    if (!this.accounts.length) return;
    const next = (index + delta + this.accounts.length) % this.accounts.length;
    this.select(this.accounts[next].id);
  }

  stored(id) {
    return this.prefs.accounts.find((account) => account.id === id);
  }

  updateStored(id, patch) {
    const stored = this.stored(id);
    if (!stored) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === false || value === '') delete stored[key];
      else stored[key] = value;
    }
    this.save();
    this.accounts = resolveAccounts(this.prefs.accounts, this.catalogById);
    this.pushState();
    this.tray?.update();
  }

  addAccount(serviceId) {
    if (!this.catalogById.has(serviceId)) return;
    const id = newAccountId(serviceId, this.prefs.accounts.map((account) => account.id));
    this.prefs.accounts.push({ id, service: serviceId });
    this.save();
    this.sync();
    this.select(id);
  }

  async removeAccount(id) {
    const account = this.account(id);
    if (!account) return;
    const { response } = await dialog.showMessageBox(this.win, {
      type: 'warning',
      buttons: ['Retirer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      message: `Retirer ${account.name} ?`,
      detail: 'Sa session sera effacée de Yougo Msg : il faudra se reconnecter pour le rajouter.',
    });
    if (response !== 0 || !this.account(id)) return;
    const index = this.accounts.findIndex((candidate) => candidate.id === id);
    this.prefs.accounts = this.prefs.accounts.filter((candidate) => candidate.id !== id);
    if (this.prefs.activeId === id) this.prefs.activeId = (this.accounts[index + 1] ?? this.accounts[index - 1])?.id ?? null;
    if (!this.prefs.pendingPartitionDeletes.includes(id)) this.prefs.pendingPartitionDeletes.push(id);
    this.save();
    const ses = this.views.get(id)?.webContents.session;
    this.sync();
    this.select(this.prefs.activeId);
    // Les fichiers de la partition sont verrouillés tant que la session vit : effacement complet au prochain démarrage.
    if (ses) await Promise.allSettled([ses.clearStorageData(), ses.clearCache()]);
    this.log('info', `compte retiré : ${id}`);
  }

  async renameAccount(id) {
    const account = this.account(id);
    if (!account) return;
    const name = await prompt(this.win, {
      title: 'Renommer',
      label: `Nom affiché pour ce compte ${account.service.name} (vide = nom par défaut)`,
      value: this.stored(id)?.name ?? '',
      placeholder: account.name,
    });
    if (name === null) return;
    this.updateStored(id, { name: name.trim().slice(0, 40) || undefined });
  }

  moveAccount(id, delta) {
    this.reorder(moveAccount(this.prefs.accounts, id, delta));
  }

  placeAccount(id, targetId, after) {
    this.reorder(placeAccount(this.prefs.accounts, id, targetId, after));
  }

  reorder(accounts) {
    if (accounts === this.prefs.accounts) return;
    this.prefs.accounts = accounts;
    this.save();
    this.accounts = resolveAccounts(this.prefs.accounts, this.catalogById);
    this.pushState();
    this.tray?.update();
  }

  toggleMuted(id) {
    const account = this.account(id);
    if (!account) return;
    this.updateStored(id, { muted: !account.muted });
    this.updateAudio(id);
    this.updateIndicators();
  }

  // ---------------------------------------------------------------- ne pas déranger

  dndActive() {
    if (!this.prefs.dnd) return false;
    return this.prefs.dndUntil === null || Date.now() < this.prefs.dndUntil;
  }

  // mode : 'off', 'on' (jusqu'à réactivation), '1h', 'tomorrow' (demain 8 h)
  setDnd(mode) {
    const until = { '1h': Date.now() + 3600e3, tomorrow: nextMorning() }[mode] ?? null;
    this.prefs.dnd = mode !== 'off';
    this.prefs.dndUntil = this.prefs.dnd ? until : null;
    this.save();
    this.scheduleDndEnd();
    this.log('info', `ne pas déranger : ${mode}`);
    this.updateAllAudio();
    this.pushState();
    this.tray?.update();
  }

  scheduleDndEnd() {
    clearTimeout(this.dndTimer);
    if (!this.prefs.dnd || this.prefs.dndUntil === null) return;
    // Plafonné : les minuteries très longues débordent, et la mise en veille du PC les décale.
    const delay = Math.min(Math.max(0, this.prefs.dndUntil - Date.now()), 60e3);
    this.dndTimer = setTimeout(() => {
      if (!this.dndActive()) return this.setDnd('off');
      // Le libellé suit l'heure (« demain 08:00 » devient « 08:00 » après minuit).
      this.pushState();
      this.tray?.update();
      this.scheduleDndEnd();
    }, delay);
  }

  dndLabel() {
    if (!this.dndActive()) return 'Désactivé';
    if (this.prefs.dndUntil === null) return "Activé jusqu'à réactivation";
    const until = new Date(this.prefs.dndUntil);
    const sameDay = until.toDateString() === new Date().toDateString();
    const time = until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `Activé jusqu'à ${sameDay ? '' : 'demain '}${time}`;
  }

  dndMenuItems() {
    const active = this.dndActive();
    return [
      { label: this.dndLabel(), enabled: false },
      ...(active ? [{ label: 'Désactiver', click: () => this.setDnd('off') }] : []),
      { type: 'separator' },
      { label: 'Pendant 1 heure', click: () => this.setDnd('1h') },
      { label: "Jusqu'à demain 8 h", click: () => this.setDnd('tomorrow') },
      { label: "Jusqu'à réactivation", click: () => this.setDnd('on') },
    ];
  }

  // ---------------------------------------------------------------- son

  // Compte coupé ou ne pas déranger : sa page se tait tant qu'elle n'est pas affichée. Un son déjà en cours
  // (appel, vidéo) n'est pas coupé : on attend qu'il s'arrête.
  updateAudio(id) {
    const account = this.account(id);
    const wc = this.views.get(id)?.webContents;
    if (!account || !wc || wc.isDestroyed()) return;
    const onScreen = id === this.prefs.activeId && this.win?.isVisible() && !this.win.isMinimized();
    const silence = (account.muted || this.dndActive()) && !onScreen;
    if (!silence) wc.setAudioMuted(false);
    else if (!wc.isAudioMuted() && !wc.isCurrentlyAudible()) wc.setAudioMuted(true);
  }

  updateAllAudio() {
    for (const account of this.accounts) this.updateAudio(account.id);
  }

  // ---------------------------------------------------------------- non-lus et indicateurs

  onUnreadChange(id, next, previous) {
    const account = this.account(id);
    const rt = this.rt(id);
    if (!account || !rt) return;
    rt.unread = { count: next.count, dot: next.dot, source: next.source };
    if (previous.count !== null && next.count !== null && next.count !== previous.count) {
      this.log('info', `${id} : ${previous.count} → ${next.count} non lus (${next.source})`);
    }
    const rose = previous.count !== null && ((next.count ?? 0) > (previous.count ?? 0) || (next.dot && !previous.dot && !previous.count && !account.service.unread?.quietDot));
    if (rose && rt.loadedAt && Date.now() - rt.loadedAt > SETTLE_DELAY) {
      this.notifier.onUnreadRise(account, next);
      if (!account.muted && !this.dndActive() && this.win?.isVisible() && !this.win.isFocused()) this.win.flashFrame(true);
    }
    this.updateIndicators();
    this.pushState();
  }

  summary() {
    return summarize(this.accounts.map((account) => ({ unread: this.rt(account.id)?.unread, muted: account.muted })));
  }

  badgeKey({ count, dot }) {
    return count ? badgeText(count) : dot ? 'dot' : '';
  }

  // Titre de la fenêtre, pastille de la barre des tâches (Windows), compteur du dock (Linux), zone de notification.
  updateIndicators() {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const summary = this.summary();
    const key = this.badgeKey(summary);
    const images = this.badgeImages.get(key);
    const signature = `${key}|${Boolean(images)}`;
    if (signature === this.indicatorKey) return;
    this.indicatorKey = signature;

    win.setTitle(summary.count ? `(${summary.count}) Yougo Msg` : summary.dot ? '• Yougo Msg' : 'Yougo Msg');
    if (process.platform === 'win32') {
      const overlay = key ? (images?.overlay ?? nativeImage.createFromPath(path.join(ASSETS, 'badge.png'))) : null;
      win.setOverlayIcon(overlay, key ? `${summary.count || ''} non lus` : '');
    } else if (process.platform === 'linux') {
      app.setBadgeCount(summary.count);
    }
    this.tray?.update();
  }

  setBadgeImages(key, images) {
    const build = (representations) => {
      const image = nativeImage.createEmpty();
      for (const { scale, dataURL } of representations ?? []) {
        if (typeof dataURL === 'string' && dataURL.startsWith('data:image/png;base64,')) image.addRepresentation({ scaleFactor: scale, dataURL });
      }
      return image.isEmpty() ? null : image;
    };
    this.badgeImages.set(key, { tray: build(images?.tray), overlay: build(images?.overlay) });
    this.indicatorKey = null;
    this.updateIndicators();
  }

  trayImage() {
    return this.badgeImages.get(this.badgeKey(this.summary()))?.tray ?? this.badgeImages.get('')?.tray ?? null;
  }

  // ---------------------------------------------------------------- état pour la barre latérale

  snapshot() {
    const summary = this.summary();
    const key = this.badgeKey(summary);
    return {
      sidebarWidth: this.sidebarWidth(),
      compact: this.sidebarWidth() === SIDEBAR_COMPACT_WIDTH,
      summary,
      platform: process.platform,
      activeId: this.prefs.activeId,
      dnd: { on: this.dndActive(), label: this.dndLabel() },
      accounts: this.accounts.map((account) => {
        const rt = this.rt(account.id);
        return {
          id: account.id,
          name: account.name,
          serviceId: account.service.id,
          serviceName: account.service.name,
          color: account.service.color,
          number: account.shared ? account.number : 0,
          muted: Boolean(account.muted),
          unread: { count: rt?.unread.count ?? null, dot: Boolean(rt?.unread.dot) },
          status: views.displayStatus(rt),
          retryAt: rt?.retryAt ?? null,
          error: rt?.error ?? null,
        };
      }),
      // Images de pastille encore jamais dessinées : la barre latérale les dessine et les renvoie.
      badgeRequests: [...new Set(['', key])].filter((candidate) => !this.badgeImages.has(candidate)),
    };
  }

  // Regroupe les mises à jour d'un même tour de boucle en un seul envoi.
  pushState() {
    if (this.stateQueued) return;
    this.stateQueued = true;
    setImmediate(() => {
      this.stateQueued = false;
      const wc = this.win?.webContents;
      if (wc && !wc.isDestroyed()) wc.send('hub:state', this.snapshot());
    });
  }

  // ---------------------------------------------------------------- menus

  accountMenu(id) {
    const account = this.account(id);
    if (!account) return;
    const index = this.accounts.indexOf(account);
    const rt = this.rt(id);
    const status = views.displayStatus(rt);
    const statusLabel = { login: 'Connexion requise', offline: 'Hors ligne', crashed: 'Page plantée', unresponsive: 'Ne répond plus', waiting: 'En attente de chargement' }[status];
    Menu.buildFromTemplate([
      { label: account.name, enabled: false },
      ...(statusLabel ? [{ label: statusLabel, enabled: false }] : []),
      { type: 'separator' },
      { label: 'Notifications', type: 'checkbox', checked: !account.muted, click: () => this.toggleMuted(id) },
      { label: 'Recharger', click: () => views.reload(this, id) },
      { label: "Revenir à l'accueil", click: () => views.home(this, id) },
      { type: 'separator' },
      { label: 'Renommer…', click: () => this.renameAccount(id) },
      { label: 'Monter', enabled: index > 0, click: () => this.moveAccount(id, -1) },
      { label: 'Descendre', enabled: index < this.accounts.length - 1, click: () => this.moveAccount(id, 1) },
      { label: `Ajouter un autre compte ${account.service.name}`, click: () => this.addAccount(account.service.id) },
      { type: 'separator' },
      ...(account.service.googleSignIn
        ? [{ label: 'Connexion Google : mode compatibilité', type: 'checkbox', checked: account.userAgent === 'electron', click: () => views.toggleCompat(this, id) }]
        : []),
      { label: 'Réparer (vider le cache)', click: () => views.repair(this, id) },
      { label: 'Outils de développement', click: () => this.views.get(id)?.webContents.openDevTools({ mode: 'detach' }) },
      { type: 'separator' },
      { label: 'Retirer ce compte…', click: () => this.removeAccount(id) },
    ]).popup({ window: this.win });
  }

  addMenuItems() {
    return this.catalog.map((service) => ({ label: service.name, click: () => this.addAccount(service.id) }));
  }

  // Menu « ⋯ » de la barre latérale. La zone de notification en reprend une partie (tray.js).
  appMenuItems() {
    return [
      { label: 'Ajouter une messagerie', submenu: this.addMenuItems() },
      { label: 'Ne pas déranger', submenu: this.dndMenuItems() },
      { type: 'separator' },
      ...this.settingsMenuItems(),
      { type: 'separator' },
      ...this.toolsMenuItems(),
      { type: 'separator' },
      this.quitMenuItem(),
    ];
  }

  settingsMenuItems() {
    const canAutostart = autostart.supported();
    return [
      {
        label: 'Lancer au démarrage',
        type: 'checkbox',
        enabled: canAutostart,
        sublabel: canAutostart ? undefined : 'Version installée seulement',
        checked: canAutostart && autostart.isEnabled(),
        click: (item) => {
          autostart.setEnabled(item.checked);
          this.tray?.update(true);
        },
      },
      ...(this.trayAvailable
        ? [
            {
              label: 'Fermer = garder dans la zone de notification',
              type: 'checkbox',
              checked: this.prefs.closeToTray,
              click: (item) => {
                this.prefs.closeToTray = item.checked;
                this.save();
                this.tray?.update(true);
              },
            },
          ]
        : []),
    ];
  }

  toolsMenuItems() {
    return [
      { label: 'Tout recharger', click: () => this.accounts.forEach((account) => views.reload(this, account.id)) },
      { label: 'Diagnostic…', click: () => require('./diagnostics').openWindow(this) },
      { label: 'Ouvrir le dossier des journaux', click: () => shell.openPath(this.log.dir) },
    ];
  }

  quitMenuItem() {
    return { label: 'Quitter Yougo Msg', click: () => app.quit() };
  }

  appMenu() {
    const { electronAge, ELECTRON_OLD_DAYS } = require('./diagnostics');
    const age = electronAge();
    Menu.buildFromTemplate([
      { label: `Yougo Msg ${app.getVersion()} · Electron ${process.versions.electron}`, enabled: false },
      // Pas de mise à jour automatique : on prévient quand le Chromium embarqué vieillit.
      ...(age > ELECTRON_OLD_DAYS ? [{ label: `Electron a ${age} jours : npm run update:electron`, enabled: false }] : []),
      { type: 'separator' },
      ...this.appMenuItems(),
    ]).popup({ window: this.win });
  }

  dndMenu() {
    Menu.buildFromTemplate(this.dndMenuItems()).popup({ window: this.win });
  }

  // ---------------------------------------------------------------- raccourcis

  // Captés dans toutes les vues (le focus est souvent dans la messagerie).
  // `input.code` plutôt que `input.key` : Ctrl+1 doit marcher aussi en AZERTY. Alt exclu (AltGr = Ctrl+Alt).
  handleShortcut(event, input) {
    if (input.type !== 'keyDown') return;
    const active = this.views.get(this.prefs.activeId)?.webContents;
    const live = active && !active.isDestroyed() ? active : null;
    if (input.code === 'F5' && !input.control && !input.alt) {
      live?.reload();
    } else if (input.code === 'F12' && !input.control && !input.alt) {
      live?.toggleDevTools();
    } else if (!(input.control || input.meta) || input.alt) {
      return;
    } else if (/^(Digit|Numpad)[1-9]$/.test(input.code) && !input.shift) {
      const account = this.accounts[Number(input.code.slice(-1)) - 1];
      if (account) this.select(account.id);
    } else if (input.code === 'Tab') {
      this.selectRelative(input.shift ? -1 : 1);
    } else if (input.code === 'KeyR' && !input.shift) {
      live?.reload();
    } else if (input.code === 'KeyR' && input.shift) {
      live?.reloadIgnoringCache();
    } else if (input.code === 'KeyI' && input.shift) {
      live?.toggleDevTools();
    } else if (['Equal', 'NumpadAdd'].includes(input.code)) {
      views.zoom(this, this.prefs.activeId, 1);
    } else if (['Minus', 'NumpadSubtract'].includes(input.code)) {
      views.zoom(this, this.prefs.activeId, -1);
    } else if (['Digit0', 'Numpad0'].includes(input.code) && !input.shift) {
      views.zoom(this, this.prefs.activeId, 0);
    } else {
      return;
    }
    event.preventDefault();
  }

  // ---------------------------------------------------------------- fermeture

  // Ferme toutes les pages (vues et fenêtres d'appel) avant de quitter : une page encore ouverte peut retenir
  // le processus (demande de passkey en cours sous Windows).
  async closeAllPages(timeoutMs = 3000) {
    const contents = [];
    for (const rt of this.runtime.values()) contents.push(...rt.webContents());
    const closing = contents
      .filter((wc) => !wc.isDestroyed())
      .map(
        (wc) =>
          new Promise((resolve) => {
            wc.once('destroyed', resolve);
            try {
              wc.close();
            } catch {
              resolve();
            }
          }),
      );
    await Promise.race([Promise.all(closing), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }
}

module.exports = { Hub, SIDEBAR_WIDTH };
