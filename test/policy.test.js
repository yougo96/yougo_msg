const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hostMatches, unwrapLink, navigationDecision, popupDecision, permissionAllowed, canOpenExternally, shouldSleep, SLEEP_AFTER } = require('../src/policy');
const CATALOG = require('../src/services');

const service = (id) => CATALOG.find((entry) => entry.id === id);

test('domaines : suffixe exact', () => {
  assert.ok(hostMatches('www.facebook.com', ['facebook.com']));
  assert.ok(hostMatches('facebook.com', ['facebook.com']));
  assert.ok(!hostMatches('evilfacebook.com', ['facebook.com']));
  assert.ok(!hostMatches('facebook.com.evil.io', ['facebook.com']));
  assert.ok(hostMatches('WEB.WhatsApp.com', ['web.whatsapp.com']));
});

test('liens de redirection des services : on ouvre la vraie destination', () => {
  assert.equal(unwrapLink('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1&h=xyz'), 'https://example.org/a?b=1');
  assert.equal(unwrapLink('https://l.instagram.com/?u=https%3A%2F%2Fexample.org%2F'), 'https://example.org/');
  assert.equal(unwrapLink('https://www.google.com/url?q=https://example.org/doc&sa=D'), 'https://example.org/doc');
  assert.equal(unwrapLink('https://www.google.com/search?q=chat'), 'https://www.google.com/search?q=chat');
  // Pas de schéma dangereux caché derrière un lien.
  assert.equal(unwrapLink('https://l.facebook.com/l.php?u=javascript%3Aalert(1)'), 'https://l.facebook.com/l.php?u=javascript%3Aalert(1)');
});

test('navigation : domaines du service dans l’app, le reste dans le navigateur', () => {
  assert.equal(navigationDecision(service('messenger'), 'https://www.facebook.com/checkpoint/'), 'allow');
  assert.equal(navigationDecision(service('messenger'), 'https://example.org/'), 'external');
  assert.equal(navigationDecision(service('whatsapp'), 'https://faq.whatsapp.com/'), 'external');
  assert.equal(navigationDecision(service('googlechat'), 'https://accounts.google.com/v3/signin/identifier'), 'allow');
  assert.equal(navigationDecision(service('discord'), 'https://discord.gg/abc'), 'allow');
  assert.equal(navigationDecision(service('discord'), 'file:///C:/Windows/win.ini'), 'block');
  assert.equal(navigationDecision(service('discord'), 'mailto:a@b.c'), 'external');
  assert.equal(navigationDecision(service('discord'), 'about:blank'), 'allow');
});

test('navigation : page marketing de Google Chat remplacée par la connexion', () => {
  const decision = navigationDecision(service('googlechat'), 'https://workspace.google.com/products/chat/');
  assert.ok(decision.rewrite.startsWith('https://accounts.google.com/AccountChooser'));
});

test('fenêtres : appels et connexion dans l’app, liens dans le navigateur', () => {
  assert.equal(popupDecision(service('googlechat'), 'https://meet.google.com/abc-defg-hij'), 'window');
  assert.equal(popupDecision(service('googlechat'), 'https://accounts.google.com/ServiceLogin?continue=x'), 'window');
  assert.equal(popupDecision(service('googlechat'), 'https://docs.google.com/document/d/1'), 'external');
  assert.equal(popupDecision(service('messenger'), 'https://www.messenger.com/groupcall/ROOM:123/'), 'window');
  assert.equal(popupDecision(service('whatsapp'), 'about:blank'), 'blank');
  assert.equal(popupDecision(service('whatsapp'), ''), 'blank');
  assert.equal(popupDecision(service('whatsapp'), 'file:///etc/passwd'), 'deny');
  assert.ok(!canOpenExternally('javascript:alert(1)'));
});

test('permissions : liste fermée, domaines du service seulement', () => {
  const whatsapp = service('whatsapp');
  assert.ok(permissionAllowed(whatsapp, 'notifications', 'https://web.whatsapp.com'));
  assert.ok(permissionAllowed(whatsapp, 'media', 'https://web.whatsapp.com/', { mediaTypes: ['audio', 'video'] }));
  assert.ok(!permissionAllowed(whatsapp, 'media', 'https://ads.example.com/', { mediaTypes: ['audio'] }));
  assert.ok(!permissionAllowed(whatsapp, 'geolocation', 'https://web.whatsapp.com'));
  assert.ok(!permissionAllowed(whatsapp, 'notifications', 'http://web.whatsapp.com'));
  assert.ok(permissionAllowed(whatsapp, 'display-capture', 'https://web.whatsapp.com'));
  assert.ok(permissionAllowed(whatsapp, 'openExternal', '', { externalURL: 'mailto:a@b.c' }));
  assert.ok(!permissionAllowed(whatsapp, 'openExternal', '', { externalURL: 'ms-settings:privacy' }));
});

test('veille : compte quitté depuis 10 min, réglé pour ou en attente de connexion', () => {
  const now = 1e12;
  const left = { active: false, busy: false, leftAt: now - SLEEP_AFTER };
  assert.ok(shouldSleep({ ...left, enabled: true, loggedOut: false }, now));
  assert.ok(shouldSleep({ ...left, enabled: false, loggedOut: true }, now));
  assert.ok(!shouldSleep({ ...left, enabled: false, loggedOut: false }, now), 'sans réglage, une page connectée reste ouverte');
  assert.ok(!shouldSleep({ ...left, enabled: true, loggedOut: false, leftAt: now - SLEEP_AFTER + 1000 }, now), 'quitté trop récemment');
  assert.ok(!shouldSleep({ ...left, enabled: true, loggedOut: false, active: true }, now), 'compte affiché');
  assert.ok(!shouldSleep({ ...left, enabled: true, loggedOut: true, busy: true }, now), 'appel ou son en cours');
});
