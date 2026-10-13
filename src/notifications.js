// Notifications de l'app : celles des pages (relayées par preload/service.js) et, quand une messagerie n'en
// envoie pas, une notification « Nouveau message » déclenchée par la hausse de son compteur.
const { Notification, nativeImage } = require('electron');
const path = require('node:path');
const { escapeMarkup } = require('./linux');

// Icône de la messagerie sur une tuile sombre : lisible sur une notification claire comme sombre (npm run icons).
const ICONS = path.join(__dirname, '..', 'assets', 'services');
const KEEP = 100; // notifications gardées en mémoire : sans référence, leur clic est perdu
const BURST = { count: 5, windowMs: 10e3 }; // au-delà, une notification de synthèse
const FALLBACK_DELAY = 4000; // laisse le temps à la page de notifier elle-même
const PAGE_RECENT = 8000;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

class Notifier {
  constructor(hub) {
    this.hub = hub;
    this.live = new Map(); // clé -> { notification, accountId, frame, pageId }
    this.byTag = new Map(); // `${accountId}:${tag}` -> clé
    this.bursts = new Map(); // accountId -> { times, overflow, timer }
    this.fallbackTimers = new Map();
    this.icons = new Map();
    this.counter = 0;
    this.supportedValue = undefined;
  }

  // Vérifié au premier besoin seulement : sous Windows, la première utilisation des notifications crée un
  // raccourci dans le menu Démarrer (Electron 41+), ce qu'un test qui n'en affiche pas doit éviter.
  supported() {
    if (this.supportedValue === undefined) {
      this.supportedValue = Notification.isSupported();
      if (!this.supportedValue) this.hub.log('warn', 'notifications non prises en charge par le système');
    }
    return this.supportedValue;
  }

  icon(serviceId) {
    if (!this.icons.has(serviceId)) this.icons.set(serviceId, nativeImage.createFromPath(path.join(ICONS, `${serviceId}.png`)));
    return this.icons.get(serviceId);
  }

  // L'utilisateur regarde déjà ce compte : pas de notification.
  watching(account) {
    const win = this.hub.win;
    return Boolean(win && !win.isDestroyed() && win.isVisible() && win.isFocused() && this.hub.prefs.activeId === account.id);
  }

  allowed(account) {
    return !this.hub.dndActive() && !account.muted && !this.watching(account);
  }

  // Notification d'une page. frame : la WebFrameMain qui l'a créée, pour lui renvoyer le clic.
  fromPage(account, frame, { id, title, body, tag, silent }) {
    const rt = this.hub.rt(account.id);
    if (!rt) return;
    rt.lastPageNotificationAt = Date.now();
    rt.stats.page += 1;
    rt.stats.lastAt = Date.now();
    this.cancelFallback(account.id);
    if (!this.allowed(account)) {
      rt.stats.suppressed += 1;
      return;
    }
    this.show(account, { title: title ? `${account.name} · ${title}` : account.name, body, silent, tag, frame, pageId: id });
  }

  // La page a fermé sa notification (conversation lue ailleurs) : on retire celle du système.
  closeFromPage(account, frame, pageId) {
    const sameFrame = (other) => {
      try {
        return other === frame || (other.processId === frame.processId && other.routingId === frame.routingId);
      } catch {
        return false;
      }
    };
    for (const [key, entry] of this.live) {
      if (entry.accountId === account.id && entry.pageId === pageId && entry.frame && sameFrame(entry.frame)) {
        entry.notification.close();
        this.forget(key);
      }
    }
  }

  // Le compteur d'un compte vient de monter. Si la page ne notifie pas d'ici quelques secondes, on le fait.
  onUnreadRise(account, unread) {
    const rt = this.hub.rt(account.id);
    if (!rt || !this.allowed(account) || Date.now() - rt.lastPageNotificationAt < PAGE_RECENT) return;
    this.cancelFallback(account.id);
    this.fallbackTimers.set(
      account.id,
      setTimeout(() => {
        this.fallbackTimers.delete(account.id);
        const current = this.hub.account(account.id);
        if (!current || !this.allowed(current) || Date.now() - rt.lastPageNotificationAt < PAGE_RECENT + FALLBACK_DELAY) return;
        rt.stats.fallback += 1;
        rt.stats.lastAt = Date.now();
        const count = unread.count ?? 0;
        this.show(current, { title: `${current.name} · Nouveau message`, body: count ? `${count} non lu${count > 1 ? 's' : ''}` : '' });
      }, FALLBACK_DELAY),
    );
  }

  cancelFallback(accountId) {
    clearTimeout(this.fallbackTimers.get(accountId));
    this.fallbackTimers.delete(accountId);
  }

  // Message de l'app elle-même (ex. « HP Message reste ouvert »).
  info(title, body) {
    if (!this.supported()) return;
    const notification = new Notification({ title, body, icon: path.join(__dirname, '..', 'assets', 'icon.png') });
    notification.on('click', () => this.hub.showWindow());
    this.keep(`info-${(this.counter += 1)}`, { notification });
    notification.show();
  }

  // Rafale (ex. une discussion de groupe active) : au-delà de 5 en 10 s, une seule notification de synthèse.
  throttled(account) {
    const now = Date.now();
    const burst = this.bursts.get(account.id) ?? { times: [], overflow: 0, timer: null };
    this.bursts.set(account.id, burst);
    burst.times = burst.times.filter((at) => now - at < BURST.windowMs);
    if (burst.times.length < BURST.count) {
      burst.times.push(now);
      return false;
    }
    burst.overflow += 1;
    if (!burst.timer) {
      burst.timer = setTimeout(() => {
        const overflow = burst.overflow;
        Object.assign(burst, { overflow: 0, timer: null, times: [] });
        const current = this.hub.account(account.id);
        if (overflow && current && this.allowed(current)) this.show(current, { title: current.name, body: `${overflow} autre${overflow > 1 ? 's' : ''} message${overflow > 1 ? 's' : ''}` });
      }, BURST.windowMs);
    }
    return true;
  }

  show(account, { title, body = '', silent = false, tag = '', frame = null, pageId = null }) {
    if (!this.supported() || this.throttled(account)) return;
    const linux = process.platform === 'linux';
    const notification = new Notification({
      title: clip(title, 120),
      // Linux : seul le corps est lu comme du balisage, le titre est affiché tel quel.
      body: linux ? escapeMarkup(clip(body, 300)) : clip(body, 300),
      icon: this.icon(account.service.id),
      silent,
      urgency: 'normal',
      // Windows : regroupées par compte dans le centre de notifications.
      groupId: account.id,
      groupTitle: account.name,
    });
    const key = `n-${(this.counter += 1)}`;
    // Même conversation (même tag) : la nouvelle notification remplace la précédente.
    const tagKey = tag ? `${account.id}:${tag}` : null;
    if (tagKey && this.byTag.has(tagKey)) {
      const previous = this.byTag.get(tagKey);
      this.live.get(previous)?.notification.close();
      this.forget(previous);
    }
    if (tagKey) this.byTag.set(tagKey, key);
    notification.on('click', () => {
      this.hub.showWindow();
      this.hub.select(account.id);
      // Rejoue le clic dans la page, qui ouvre la bonne conversation.
      try {
        if (frame && !frame.isDestroyed?.()) frame.send('service:notification-click', pageId);
      } catch {}
      this.forget(key);
    });
    notification.on('failed', (_event, error) => this.hub.log('warn', `notification non affichée : ${error}`));
    this.keep(key, { notification, accountId: account.id, frame, pageId, tagKey });
    notification.show();
  }

  keep(key, entry) {
    this.live.set(key, entry);
    while (this.live.size > KEEP) this.forget(this.live.keys().next().value);
  }

  forget(key) {
    const entry = this.live.get(key);
    if (entry?.tagKey && this.byTag.get(entry.tagKey) === key) this.byTag.delete(entry.tagKey);
    this.live.delete(key);
  }
}

module.exports = { Notifier };
