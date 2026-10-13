// Compteur de non-lus d'un compte, à partir des signaux de sa page. Sans dépendance à Electron (testé dans test/).
//
// Sources, de la plus fiable à la moins fiable :
//   badge    valeur publiée par la page via navigator.setAppBadge() (si le service le déclare)
//   page     fonction de lecture de la page déclarée dans le catalogue (null = page pas prête)
//   title    règles sur le titre de la page
//   favicon  favicon « avec pastille » : non-lus sans nombre
// Résultat : { count, dot }. count vaut null tant qu'aucune source ne sait.

const DEFAULT_TITLE_RULES = [{ match: /^\((\d+)\+?\)/ }];
// Une baisse n'est publiée que si elle dure : certains titres clignotent (« (2) Messenger » / « Marie vous a écrit »).
const DECREASE_DELAY = 2500;

function parseTitle(title, rules = DEFAULT_TITLE_RULES) {
  for (const rule of rules) {
    const match = rule.match.exec(title ?? '');
    if (!match) continue;
    if (rule.dot) return { count: 0, dot: true };
    return { count: Number(match[1]) || 0, dot: false };
  }
  return { count: 0, dot: false };
}

function parseFavicon(urls, pattern) {
  return Boolean(pattern) && (urls ?? []).some((url) => pattern.test(url));
}

// Résultat d'une fonction `page`, qui vient de la page : on ne lui fait pas confiance.
function sanitizePageResult(value) {
  if (value === null || typeof value !== 'object') return null;
  const count = Number.isFinite(value.count) ? Math.max(0, Math.min(Math.floor(value.count), 99999)) : null;
  return { count, dot: value.dot === true };
}

function sanitizeBadge(value) {
  if (value === -1) return { count: 0, dot: true }; // setAppBadge() sans nombre
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? { count: Math.min(Math.floor(count), 99999), dot: false } : null;
}

const same = (a, b) => a.count === b.count && a.dot === b.dot;
const lower = (next, current) => (next.count ?? 0) < (current.count ?? 0) || (current.dot && !next.dot && !next.count);

class UnreadTracker {
  // onChange(state) est appelé à chaque changement publié. state = { count, dot, source }.
  constructor(unread = {}, onChange = () => {}) {
    this.titleRules = unread.title === false ? null : (unread.title ?? DEFAULT_TITLE_RULES);
    this.faviconPattern = unread.favicon ?? null;
    this.useBadge = unread.badge === true;
    this.onChange = onChange;
    this.signals = {};
    this.state = { count: null, dot: false, source: null };
    this.timer = null;
  }

  setTitle(title) {
    this.signals.title = title;
    this.update();
  }

  setFavicons(urls) {
    this.signals.favicons = urls;
    this.update();
  }

  setPage(value) {
    this.signals.page = sanitizePageResult(value);
    this.update();
  }

  setBadge(value) {
    if (!this.useBadge) return;
    this.signals.badge = sanitizeBadge(value);
    this.update();
  }

  // Page rechargée ou plantée : on repart de zéro, sans rien publier (l'appelant affiche l'état du compte).
  reset() {
    clearTimeout(this.timer);
    this.timer = null;
    this.signals = {};
    this.state = { count: null, dot: false, source: null };
  }

  compute() {
    const { badge, page, title, favicons } = this.signals;
    const fromTitle = this.titleRules && title !== undefined ? parseTitle(title, this.titleRules) : null;
    const dot = Boolean(badge?.dot || page?.dot || fromTitle?.dot || parseFavicon(favicons, this.faviconPattern));
    if (badge) return { count: badge.count, dot, source: 'badge' };
    if (page && page.count !== null) return { count: page.count, dot, source: 'page' };
    if (fromTitle) return { count: fromTitle.count, dot, source: 'title' };
    if (dot) return { count: 0, dot, source: 'favicon' };
    return { count: null, dot: false, source: null };
  }

  update() {
    const next = this.compute();
    if (same(next, this.state)) {
      clearTimeout(this.timer);
      this.timer = null;
      this.state.source = next.source;
      return;
    }
    if (this.state.count !== null && lower(next, this.state)) {
      // Baisse : on attend qu'elle se confirme.
      if (!this.timer) this.timer = setTimeout(() => this.confirmDecrease(), DECREASE_DELAY);
      return;
    }
    this.publish(next);
  }

  confirmDecrease() {
    this.timer = null;
    const next = this.compute();
    if (!same(next, this.state)) this.publish(next);
  }

  publish(next) {
    clearTimeout(this.timer);
    this.timer = null;
    const previous = this.state;
    this.state = next;
    this.onChange(next, previous);
  }
}

// Total affiché dans la barre des tâches, la zone de notification et le titre : comptes non coupés seulement.
function summarize(entries) {
  let count = 0;
  let dot = false;
  for (const { unread, muted } of entries) {
    if (muted || !unread) continue;
    count += unread.count ?? 0;
    dot ||= unread.dot;
  }
  return { count, dot: dot && count === 0 };
}

const badgeText = (count) => (count > 99 ? '99+' : String(count));

module.exports = { UnreadTracker, parseTitle, parseFavicon, sanitizePageResult, sanitizeBadge, summarize, badgeText, DEFAULT_TITLE_RULES, DECREASE_DELAY };
