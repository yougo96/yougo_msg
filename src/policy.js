// Règles de navigation, de fenêtres et de permissions des messageries. Fonctions pures, testées dans test/.

// `hosts` contient des suffixes de domaine : 'facebook.com' couvre www.facebook.com, pas evilfacebook.com.
function hostMatches(hostname, hosts = []) {
  const host = hostname.toLowerCase();
  return hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Liens de redirection des services vers l'extérieur : on ouvre directement la vraie destination.
const LINK_SHIMS = {
  'l.facebook.com': 'u',
  'lm.facebook.com': 'u',
  'l.messenger.com': 'u',
  'l.instagram.com': 'u',
  'www.google.com': 'q', // https://www.google.com/url?q=…
};

function unwrapLink(url) {
  const parsed = parse(url);
  const param = parsed && LINK_SHIMS[parsed.hostname];
  if (!param || (parsed.hostname === 'www.google.com' && parsed.pathname !== '/url')) return url;
  const target = parse(parsed.searchParams.get(param) ?? '');
  return target && ['http:', 'https:'].includes(target.protocol) ? target.href : url;
}

// Liens qu'on accepte de confier au système (navigateur, client mail, téléphone).
function canOpenExternally(url) {
  const parsed = parse(url);
  return Boolean(parsed) && ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
}

function rewriteFor(service, url) {
  for (const [pattern, target] of service.rewrites ?? []) if (pattern.test(url)) return target;
  return null;
}

// Navigation de la page principale d'une vue : 'allow', 'external' (navigateur), 'block' ou { rewrite: url }.
function navigationDecision(service, url) {
  const rewrite = rewriteFor(service, url);
  if (rewrite) return { rewrite };
  const parsed = parse(url);
  if (!parsed) return 'block';
  if (parsed.protocol === 'about:') return 'allow';
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return canOpenExternally(url) ? 'external' : 'block';
  return hostMatches(parsed.hostname, service.hosts) ? 'allow' : 'external';
}

// window.open d'une page : 'window' (fenêtre de l'app, session du compte), 'external', 'blank' ou 'deny'.
// 'blank' : about:blank, que la page remplit ensuite ; on décidera à sa première vraie navigation.
function popupDecision(service, url) {
  if (!url || url === 'about:blank') return 'blank';
  if ((service.popups ?? []).some((pattern) => pattern.test(url))) return 'window';
  return canOpenExternally(url) ? 'external' : 'deny';
}

// Permissions accordées aux messageries, et seulement sur leurs domaines.
const ALLOWED_PERMISSIONS = new Set([
  'notifications',
  'media', // micro et caméra pour les appels
  'display-capture', // partage d'écran (nom utilisé à partir d'Electron 45)
  'speaker-selection',
  'clipboard-sanitized-write',
  'fullscreen',
  'storage-access',
  'top-level-storage-access',
  'persistent-storage', // WhatsApp la demande : protège ses données (donc la session) de l'éviction
]);

function permissionAllowed(service, permission, origin, details = {}) {
  if (permission === 'openExternal') return /^(mailto|tel):/.test(details.externalURL ?? '');
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  if (permission === 'media' && (details.mediaTypes ?? []).some((type) => type !== 'audio' && type !== 'video')) return false;
  const parsed = parse(origin ?? '');
  // Sans origine connue (ex. vérification faite pour un service worker), on s'en tient à la liste.
  if (!parsed || parsed.origin === 'null') return true;
  return parsed.protocol === 'https:' && hostMatches(parsed.hostname, service.hosts);
}

module.exports = {
  hostMatches,
  unwrapLink,
  canOpenExternally,
  navigationDecision,
  popupDecision,
  permissionAllowed,
  ALLOWED_PERMISSIONS,
};
