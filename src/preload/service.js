// Injecté dans chaque page des messageries (y compris leurs iframes et leurs fenêtres d'appel).
// Tourne avant les scripts de la page. Rien n'est exposé à la page : le pont vers l'app est passé en argument
// des fonctions exécutées dans la page, jamais posé sur `window`.
const { contextBridge, ipcRenderer } = require('electron');

// Réglages du service (synchrone : ils doivent être connus avant les scripts de la page).
let config = {};
try {
  config = ipcRenderer.sendSync('service:config') ?? {};
} catch {}

// 1. Notifications : la page croit utiliser l'API Notification, l'app affiche la notification elle-même
//    (nom du compte, ne pas déranger, comptes coupés) et rejoue le clic dans la page, qui ouvre la bonne
//    conversation. Electron n'affiche jamais les notifications des service workers : on les détourne aussi.
contextBridge.executeInMainWorld({
  func: (notify, closeNotification, onClick) => {
    // Messenger passe parfois des éléments React au lieu de texte.
    const text = (value) => {
      if (typeof value === 'string') return value;
      if (value === null || value === undefined) return '';
      const content = value?.props?.content ?? value?.props?.children;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.filter((part) => typeof part === 'string').join('');
      try {
        return String(value);
      } catch {
        return '';
      }
    };

    const pending = new Map(); // id -> notification, pour rejouer le clic côté page
    let nextId = 0;

    const emit = (notification, type) => {
      const event = new Event(type);
      notification.dispatchEvent(event);
      try {
        notification[`on${type}`]?.call(notification, event);
      } catch (error) {
        setTimeout(() => {
          throw error;
        });
      }
    };

    class Notification extends EventTarget {
      static get permission() {
        return 'granted';
      }

      static requestPermission(callback) {
        try {
          callback?.('granted');
        } catch {}
        return Promise.resolve('granted');
      }

      static get maxActions() {
        return 0;
      }

      constructor(title, options = {}) {
        super();
        const id = `${Date.now().toString(36)}-${(nextId += 1)}`;
        Object.defineProperty(this, '__id', { value: id });
        this.title = text(title);
        this.body = text(options.body);
        this.tag = String(options.tag ?? '');
        this.data = options.data ?? null;
        this.icon = String(options.icon ?? '');
        this.badge = String(options.badge ?? '');
        this.image = String(options.image ?? '');
        this.lang = String(options.lang ?? '');
        this.dir = options.dir ?? 'auto';
        this.silent = options.silent === true;
        this.renotify = options.renotify === true;
        this.requireInteraction = options.requireInteraction === true;
        this.timestamp = options.timestamp ?? Date.now();
        this.actions = [];
        this.onclick = this.onclose = this.onerror = this.onshow = null;
        pending.set(id, this);
        if (pending.size > 50) pending.delete(pending.keys().next().value);
        notify(id, this.title, this.body, this.tag, this.silent);
        setTimeout(() => emit(this, 'show'));
      }

      close() {
        if (!pending.delete(this.__id)) return;
        closeNotification(this.__id);
        emit(this, 'close');
      }
    }

    onClick((id) => {
      const notification = pending.get(id);
      if (!notification) return;
      try {
        window.focus();
      } catch {}
      emit(notification, 'click');
    });

    // Les affectations de la page sont ignorées : elle ne peut pas remettre l'API d'origine.
    Object.defineProperty(window, 'Notification', { get: () => Notification, set: () => {}, configurable: false });
    if (window.ServiceWorkerRegistration) {
      ServiceWorkerRegistration.prototype.showNotification = async function showNotification(title, options) {
        new Notification(title, options);
      };
      ServiceWorkerRegistration.prototype.getNotifications = async () => [];
    }
  },
  args: [
    (id, title, body, tag, silent) => ipcRenderer.send('service:notify', { id, title, body, tag, silent }),
    (id) => ipcRenderer.send('service:notification-close', id),
    (callback) => ipcRenderer.on('service:notification-click', (_event, id) => callback(id)),
  ],
});

// 2. Pastille de l'application : une page qui appelle navigator.setAppBadge() écraserait celle de l'app.
//    On récupère la valeur à la place (c'est le meilleur compteur de Telegram). -1 = pastille sans nombre.
contextBridge.executeInMainWorld({
  func: (setBadge) => {
    if (!('setAppBadge' in Navigator.prototype)) return;
    Navigator.prototype.setAppBadge = function setAppBadge(value) {
      setBadge(value === undefined ? -1 : Number(value));
      return Promise.resolve();
    };
    Navigator.prototype.clearAppBadge = function clearAppBadge() {
      setBadge(0);
      return Promise.resolve();
    };
  },
  args: [(value) => ipcRenderer.send('service:badge', value)],
});

// 3. Électron n'a pas de service Push : une page qui voit l'API Push confie ses notifications à son service
//    worker, et elles se perdent. Sans l'API, elle notifie depuis la page (Telegram).
if (config.noPush) {
  contextBridge.executeInMainWorld({
    func: () => {
      delete window.PushManager;
    },
  });
}

// 4. Piège Windows : les pages de connexion Meta et Google lancent une demande de passkey silencieuse
//    (mediation 'conditional'). Si elle est encore en cours à la fermeture, Windows Hello garde le processus en
//    vie et ce processus fantôme empêche tout relancement. On la neutralise, création silencieuse comprise.
//    La connexion par passkey reste possible quand on la demande explicitement.
contextBridge.executeInMainWorld({
  func: () => {
    if (!window.PublicKeyCredential || !window.CredentialsContainer) return;
    // Comme si l'utilisateur ne choisissait jamais de passkey, sauf annulation par la page.
    const untilAborted = (signal) =>
      new Promise((_resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    const proto = CredentialsContainer.prototype;
    for (const method of ['get', 'create']) {
      const original = proto[method];
      proto[method] = function credentials(options) {
        if (options?.mediation === 'conditional') return untilAborted(options.signal);
        return original.call(this, options);
      };
    }
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    if (typeof PublicKeyCredential.getClientCapabilities === 'function') {
      const capabilities = PublicKeyCredential.getClientCapabilities.bind(PublicKeyCredential);
      PublicKeyCredential.getClientCapabilities = async () => ({ ...(await capabilities()), conditionalGet: false, conditionalCreate: false });
    }
  },
});

// 5. Clés locales attendues par certaines messageries (ex. notifications de bureau de Messenger).
for (const [key, value] of Object.entries(config.localStorage ?? {})) {
  try {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  } catch {}
}
