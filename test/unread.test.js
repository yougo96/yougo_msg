const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { UnreadTracker, parseTitle, summarize, sanitizeBadge, sanitizePageResult, DECREASE_DELAY } = require('../src/unread');
const CATALOG = require('../src/services');

const discord = CATALOG.find((service) => service.id === 'discord').unread.title;

test('titre : compteur en tête seulement', () => {
  assert.deepEqual(parseTitle('(3) WhatsApp'), { count: 3, dot: false });
  assert.deepEqual(parseTitle('(99+) Messenger'), { count: 99, dot: false });
  assert.deepEqual(parseTitle('WhatsApp'), { count: 0, dot: false });
  // Un nombre entre parenthèses ailleurs dans le titre n'est pas un compteur.
  assert.deepEqual(parseTitle('Promo (2025) | Discord'), { count: 0, dot: false });
  assert.deepEqual(parseTitle('Réunion (2) notes'), { count: 0, dot: false });
});

test('titre Discord : mentions en nombre, non-lus sans mention en pastille', () => {
  assert.deepEqual(parseTitle('(4) Discord | #général | Serveur', discord), { count: 4, dot: false });
  assert.deepEqual(parseTitle('• Discord | #général | Serveur', discord), { count: 0, dot: true });
  assert.deepEqual(parseTitle('Discord | Amis', discord), { count: 0, dot: false });
  assert.deepEqual(parseTitle('Discord | Club (2024)', discord), { count: 0, dot: false });
});

test('valeurs venues des pages : filtrées', () => {
  assert.equal(sanitizePageResult(null), null);
  assert.equal(sanitizePageResult('3'), null);
  assert.deepEqual(sanitizePageResult({ count: 2.7 }), { count: 2, dot: false });
  assert.deepEqual(sanitizePageResult({ count: -4, dot: 'oui' }), { count: 0, dot: false });
  assert.deepEqual(sanitizePageResult({ dot: true }), { count: null, dot: true });
  assert.deepEqual(sanitizeBadge(-1), { count: 0, dot: true });
  assert.deepEqual(sanitizeBadge(7), { count: 7, dot: false });
  assert.equal(sanitizeBadge(Number.NaN), null);
});

test('priorités : pastille de la page > lecture de la page > titre > favicon', () => {
  const changes = [];
  const tracker = new UnreadTracker({ badge: true, favicon: /dot/, page: () => null }, (state) => changes.push(state));
  tracker.setFavicons(['https://x/favicon_dot.png']);
  assert.deepEqual(tracker.state, { count: 0, dot: true, source: 'favicon' });
  tracker.setTitle('(2) Service');
  assert.equal(tracker.state.count, 2);
  assert.equal(tracker.state.source, 'title');
  tracker.setPage({ count: 5 });
  assert.equal(tracker.state.count, 5);
  tracker.setBadge(9);
  assert.equal(tracker.state.count, 9);
  assert.equal(tracker.state.source, 'badge');
  // Page « pas prête » : le titre reprend la main (après le délai de baisse).
  assert.ok(changes.length >= 4);
});

test("titre ignoré quand le service le désactive", () => {
  const tracker = new UnreadTracker({ title: false, page: () => null });
  tracker.setTitle('(7) Chat');
  assert.equal(tracker.state.count, null);
  tracker.setPage({ count: 1 });
  assert.equal(tracker.state.count, 1);
});

test('une hausse est publiée tout de suite, une baisse seulement si elle dure', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const changes = [];
    const tracker = new UnreadTracker({}, (state) => changes.push(state.count));
    tracker.setTitle('(2) Messenger');
    assert.deepEqual(changes, [2]);
    // Titre qui clignote : la baisse n'est jamais publiée.
    tracker.setTitle('Marie vous a écrit');
    mock.timers.tick(DECREASE_DELAY / 2);
    tracker.setTitle('(2) Messenger');
    mock.timers.tick(DECREASE_DELAY);
    assert.deepEqual(changes, [2]);
    // Vraie lecture : publiée après le délai.
    tracker.setTitle('Messenger');
    assert.deepEqual(changes, [2]);
    mock.timers.tick(DECREASE_DELAY);
    assert.deepEqual(changes, [2, 0]);
    tracker.setTitle('(1) Messenger');
    assert.deepEqual(changes, [2, 0, 1]);
  } finally {
    mock.timers.reset();
  }
});

test('reset : compteur inconnu, la valeur suivante est publiée telle quelle', () => {
  const changes = [];
  const tracker = new UnreadTracker({}, (state) => changes.push(state.count));
  tracker.setTitle('(4) WhatsApp');
  tracker.reset();
  assert.equal(tracker.state.count, null);
  tracker.setTitle('WhatsApp');
  assert.deepEqual(changes, [4, 0]);
});

test('total : comptes coupés exclus, pastille seulement sans nombre', () => {
  assert.deepEqual(
    summarize([
      { unread: { count: 2, dot: false } },
      { unread: { count: 5, dot: false }, muted: true },
      { unread: { count: 0, dot: true } },
      { unread: { count: null, dot: false } },
    ]),
    { count: 2, dot: false },
  );
  assert.deepEqual(summarize([{ unread: { count: 0, dot: true } }, { unread: { count: 3, dot: true }, muted: true }]), { count: 0, dot: true });
});
