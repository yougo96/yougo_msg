// Catalogue des messageries. Ajouter une messagerie = une entrée ici + une icône src/ui/sidebar/icons/<id>.png.
//
// Champs :
//   id, name, url, color  identité, page d'accueil, couleur de marque.
//   hosts        domaines (suffixes) où la vue peut naviguer. Le reste s'ouvre dans le navigateur.
//   popups       URL (RegExp) des fenêtres ouvertes par la page à garder dans l'app, avec la session du compte
//                (appels, connexion). Les autres « nouvel onglet » partent dans le navigateur.
//   rewrites     [RegExp, URL] : page d'arrivée à remplacer (ex. page marketing au lieu de la connexion).
//   loggedOut    URL (RegExp) qui signifie « connexion requise ».
//   unread       d'où vient le compteur de non-lus. Par défaut : « (3) » en tête du titre de la page.
//     title      règles sur le titre, dans l'ordre : { match, dot }. `false` : ignorer le titre.
//     favicon    RegExp sur l'URL du favicon : si elle correspond, pastille sans nombre.
//     page       fonction autonome exécutée dans la page : renvoie { count, dot }, ou null si elle ne sait pas
//                (page pas encore prête). Elle passe avant le titre.
//     badge      true : la page publie son total via navigator.setAppBadge(). Il passe avant tout le reste.
//     quietDot   true : la pastille sans nombre ne déclenche ni « Nouveau message » ni clignotement.
//   googleSignIn true : propose le « mode compatibilité » si la connexion Google est refusée.
//   noPush       true : masque l'API Push pour que la page notifie elle-même (Electron n'a pas de Push).
//   css          CSS injecté dans la page.
//   localStorage clés posées si absentes, au chargement de la page principale.
//   enabled      false : pas créé d'office, mais disponible dans « Ajouter une messagerie ».
//
// Les sélecteurs des fonctions `page` viennent des projets libres qui suivent ces sites (Ferdium, Hangar…).
// Ils peuvent casser à chaque mise à jour d'un site : le titre ou le favicon reprennent alors le relais,
// et la fenêtre Diagnostic montre d'où vient chaque compteur.

const GOOGLE_HOSTS = ['google.com', 'youtube.com']; // accounts.youtube.com fait partie de la connexion Google
const GOOGLE_SIGN_IN = /^https:\/\/accounts\.google\.com\//;

module.exports = [
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.messenger.com/',
    color: '#0866ff',
    hosts: ['messenger.com', 'facebook.com', 'meta.com'],
    popups: [/^https:\/\/www\.(messenger|facebook)\.com\/(groupcall|videocall)\//],
    // Active les notifications de bureau de Messenger (même réglage que Ferdium).
    localStorage: { _cs_desktopNotifsEnabled: '{"__t":1760000000000,"__v":true}' },
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25d366',
    hosts: ['web.whatsapp.com'],
    // Le titre « (3) WhatsApp » compte les discussions non lues, sans les discussions en sourdine.
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/direct/inbox/',
    color: '#e1306c',
    hosts: ['instagram.com', 'facebook.com', 'meta.com'],
    loggedOut: /^https:\/\/www\.instagram\.com\/accounts\/login/,
    unread: {
      // Pastille du lien « Messages » de la barre de navigation.
      page: () => {
        const link = document.querySelector('a[href^="/direct/inbox"]');
        if (!link) return null;
        const digits = link.textContent.match(/\d+/);
        return { count: digits ? Number(digits[0]) : 0 };
      },
    },
    // Les squelettes animés de /direct/ font tourner le processeur en continu.
    css: 'svg rect { animation: none !important; }',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    url: 'https://www.snapchat.com/web/',
    color: '#fffc00',
    hosts: ['snapchat.com'],
    // Déconnecté, /web/ renvoie vers la page d'accueil de snapchat.com, qui porte le formulaire de connexion.
    loggedOut: /^https:\/\/(accounts\.snapchat\.com\/|www\.snapchat\.com\/(\?|$))/,
  },
  {
    id: 'googlechat',
    name: 'Google Chat',
    url: 'https://chat.google.com/',
    color: '#00ac47',
    hosts: GOOGLE_HOSTS,
    popups: [GOOGLE_SIGN_IN, /^https:\/\/meet\.google\.com\//],
    rewrites: [[/^https:\/\/workspace\.google\.com\/products\/chat/, 'https://accounts.google.com/AccountChooser?continue=https://chat.google.com/']],
    loggedOut: /^https:\/\/accounts\.google\.com\//,
    googleSignIn: true,
    unread: {
      title: false,
      favicon: /_dot_|new_notif/i,
      // En-têtes des sections « Messages privés » (1) et « Espaces » (2).
      page: () => {
        const sections = document.querySelectorAll('[data-section-type="1"], [data-section-type="2"]');
        if (!sections.length) return null;
        let count = 0;
        for (const section of sections) {
          const badge = section.querySelector('div.TeR7uc');
          const digits = badge?.textContent.match(/\d+/);
          if (digits) count += Number(digits[0]);
        }
        return { count };
      },
    },
  },
  {
    id: 'googlemessages',
    name: 'Messages (SMS)',
    url: 'https://messages.google.com/web/',
    color: '#1a73e8',
    hosts: GOOGLE_HOSTS,
    popups: [GOOGLE_SIGN_IN],
    loggedOut: /^https:\/\/(accounts\.google\.com\/|messages\.google\.com\/web\/(welcome|authentication))/,
    googleSignIn: true,
    unread: {
      title: false,
      // Une ligne par conversation non lue.
      page: () => {
        const list = document.querySelector('mws-conversations-list');
        if (!list) return null;
        const items = list.querySelectorAll('mws-conversation-list-item');
        let count = 0;
        for (const item of items) if (item.querySelector('[data-e2e-is-unread="true"], .unread')) count += 1;
        return { count };
      },
    },
  },
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/app',
    color: '#5865f2',
    hosts: ['discord.com', 'discord.gg'],
    loggedOut: /^https:\/\/discord\.com\/login/,
    unread: {
      // « (3) Discord | … » : mentions et messages privés. « • Discord | … » : non-lus sans mention.
      title: [{ match: /^\((\d+)\+?\)/ }, { match: /^\s*•/, dot: true }],
      // Seuls les mentions et les messages privés méritent une notification.
      quietDot: true,
    },
  },

  // Disponibles dans « Ajouter une messagerie », pas créées d'office.
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/a/',
    color: '#2aabee',
    enabled: false,
    hosts: ['web.telegram.org'],
    // Telegram publie son vrai total via setAppBadge et confie ses notifications à son service worker
    // si l'API Push existe : sans elle, il notifie depuis la page.
    unread: { badge: true, title: false },
    noPush: true,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/messaging/',
    color: '#0a66c2',
    enabled: false,
    hosts: ['linkedin.com'],
    loggedOut: /^https:\/\/www\.linkedin\.com\/(login|uas|checkpoint)/,
  },
];
