const nav = document.getElementById('accounts');
const summaryText = document.getElementById('summary');
const dndButton = document.getElementById('dnd');
const dndState = document.getElementById('dnd-state');
const menuButton = document.getElementById('menu');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelText = document.getElementById('panel-text');
const panelAction = document.getElementById('panel-action');
const rows = new Map(); // id -> éléments de la ligne
let renderedIds = '';
let state = null;
let dragged = null;

const STATUS_TEXT = {
  login: 'Connexion requise',
  offline: 'Hors ligne',
  crashed: 'Page plantée',
  unresponsive: 'Ne répond plus',
  waiting: 'En attente de chargement',
  loading: 'Chargement…',
};
const ALERTS = new Set(['login', 'offline', 'crashed', 'unresponsive']);

const element = (tag, className) => Object.assign(document.createElement(tag), { className });
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

// Une ligne : icône (avec pastille et numéro, visibles seulement en colonne d'icônes), nom et détail, non-lus à droite.
function createRow(account) {
  const button = element('button', 'account');
  button.draggable = true;
  button.addEventListener('click', () => window.hub.select(account.id));
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.hub.accountMenu(account.id);
  });

  const tile = element('span', 'tile');
  const icon = document.createElement('img');
  icon.src = `icons/${account.serviceId}.png`;
  icon.alt = '';
  icon.draggable = false;
  // Pas d'icône : on retombe sur l'initiale aux couleurs du service.
  icon.addEventListener('error', () => {
    const fallback = element('span', 'fallback');
    fallback.textContent = account.serviceName[0];
    icon.replaceWith(fallback);
  });
  const badge = element('span', 'badge');
  const number = element('span', 'number');
  tile.append(icon, badge, number);

  const text = element('span', 'text');
  const name = element('span', 'name');
  const detail = element('span', 'detail');
  text.append(name, detail);
  const trail = element('span', 'trail');
  button.append(tile, text, trail);
  setupDrag(button, account.id);
  return { button, badge, number, name, detail, trail };
}

// Réordonner en glissant un compte sur un autre.
function setupDrag(button, id) {
  const clear = () => button.classList.remove('drop-before', 'drop-after');
  const after = (event) => event.clientY - button.getBoundingClientRect().top > button.clientHeight / 2;
  button.addEventListener('dragstart', (event) => {
    dragged = id;
    event.dataTransfer.effectAllowed = 'move';
    button.classList.add('dragging');
  });
  button.addEventListener('dragend', () => {
    dragged = null;
    button.classList.remove('dragging');
  });
  button.addEventListener('dragover', (event) => {
    if (!dragged || dragged === id) return;
    event.preventDefault();
    button.classList.toggle('drop-after', after(event));
    button.classList.toggle('drop-before', !after(event));
  });
  button.addEventListener('dragleave', clear);
  button.addEventListener('drop', (event) => {
    event.preventDefault();
    clear();
    if (dragged && dragged !== id) window.hub.place(dragged, id, after(event) ? 'after' : 'before');
  });
}

// Ce qu'on signale pour un compte : alerte, nombre de non-lus, ou pastille.
function indicator(account) {
  if (ALERTS.has(account.status)) return { kind: 'alert', text: '!' };
  const { count, dot } = account.unread;
  if (count) return { kind: 'count', text: count > 99 ? '99+' : String(count) };
  if (dot) return { kind: 'dot', text: '' };
  return null;
}

// Sous le nom : la messagerie quand le compte est renommé, puis son état.
function detailText(account) {
  const parts = [];
  if (!account.name.startsWith(account.serviceName)) parts.push(account.serviceName);
  if (STATUS_TEXT[account.status]) parts.push(STATUS_TEXT[account.status]);
  else if (account.unread.dot && !account.unread.count) parts.push('Nouveaux messages');
  if (account.muted) parts.push('Notifications coupées');
  return parts.join(' · ');
}

function summaryLine() {
  const { count, dot } = state.summary;
  const alerts = state.accounts.filter((account) => ALERTS.has(account.status)).length;
  const loading = state.accounts.some((account) => !account.muted && (account.status === 'waiting' || account.status === 'loading'));
  return [
    count ? plural(count, 'non lu') : dot ? 'Nouveaux messages' : loading ? 'Chargement…' : 'Rien de nouveau',
    alerts ? `${plural(alerts, 'compte')} à vérifier` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function render(next) {
  state = next;
  document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidth}px`);
  document.body.classList.toggle('compact', state.compact);
  const titlebar = document.getElementById('titlebar');
  if (titlebar) titlebar.textContent = state.accounts.find((account) => account.id === state.activeId)?.name ?? 'Yougo Msg';
  summaryText.textContent = summaryLine();

  // Comptes ajoutés, retirés ou déplacés : on reconstruit la liste.
  const ids = state.accounts.map((account) => account.id).join();
  if (ids !== renderedIds) {
    renderedIds = ids;
    const previous = new Map(rows);
    rows.clear();
    for (const account of state.accounts) rows.set(account.id, previous.get(account.id) ?? createRow(account));
    nav.replaceChildren(...[...rows.values()].map(({ button }) => button));
  }

  state.accounts.forEach((account, index) => {
    const row = rows.get(account.id);
    const shown = indicator(account);
    const detail = detailText(account);
    const unreadText = account.unread.count ? plural(account.unread.count, 'non lu') : account.unread.dot ? 'Nouveaux messages' : '';
    const shortcut = index < 9 ? `  (Ctrl+${index + 1})` : '';
    row.button.title = [
      `${account.name}${shortcut}`,
      STATUS_TEXT[account.status],
      unreadText,
      account.muted && 'Notifications coupées',
      'Clic droit : notifications, renommer, autre compte…',
    ]
      .filter(Boolean)
      .join('\n');
    row.button.setAttribute('aria-label', [account.name, STATUS_TEXT[account.status], unreadText, account.muted && 'notifications coupées'].filter(Boolean).join(', '));
    row.button.style.setProperty('--brand', account.color);
    row.button.classList.toggle('active', account.id === state.activeId);
    row.button.classList.toggle('loading', account.status === 'loading' || account.status === 'waiting');
    row.button.classList.toggle('muted', account.muted);

    row.name.textContent = account.name;
    row.detail.textContent = detail;
    row.detail.hidden = !detail;
    for (const target of [row.trail, row.badge]) {
      target.hidden = !shown;
      target.classList.remove('alert', 'count', 'dot');
      if (shown) target.classList.add(shown.kind);
      target.textContent = shown?.text ?? '';
    }
    row.number.hidden = !account.number;
    row.number.textContent = account.number || '';
  });

  dndButton.classList.toggle('on', state.dnd.on);
  dndButton.setAttribute('aria-pressed', String(state.dnd.on));
  dndButton.title = `Ne pas déranger : ${state.dnd.label.toLowerCase()}\nClic droit : choisir une durée`;
  // Version courte du libellé : « Activé » se voit déjà à l'état du bouton.
  dndState.textContent = state.dnd.label.replace(/^Activé j/, 'J');

  renderPanel();
  for (const key of state.badgeRequests) window.hub.badgeImages(key, window.badgeArt.images(key, state.platform));
}

// Zone de droite : visible seulement quand aucune messagerie n'y est affichée.
function renderPanel() {
  const active = state.accounts.find((account) => account.id === state.activeId);
  let content = null;
  if (!state.accounts.length) {
    content = { title: 'Aucune messagerie', text: 'Ajoutez-en une depuis le menu ⋯ en bas de la barre.', action: 'Ajouter une messagerie', onAction: () => window.hub.appMenu() };
  } else if (active && (active.status === 'offline' || active.status === 'crashed')) {
    const seconds = active.retryAt ? Math.max(0, Math.round((active.retryAt - Date.now()) / 1000)) : null;
    content = {
      title: active.status === 'offline' ? `${active.name} est hors ligne` : `${active.name} s'est arrêté`,
      text: [active.error, seconds !== null ? `Nouvelle tentative dans ${seconds} s.` : ''].filter(Boolean).join(' · '),
      action: 'Réessayer',
      onAction: () => window.hub.retry(active.id),
    };
  }
  panel.hidden = !content;
  if (!content) return;
  panelTitle.textContent = content.title;
  panelText.textContent = content.text;
  panelAction.hidden = !content.action;
  panelAction.textContent = content.action ?? '';
  panelAction.onclick = content.onAction ?? null;
}

// Compte à rebours de la prochaine tentative.
setInterval(() => state && !panel.hidden && renderPanel(), 1000);

dndButton.addEventListener('click', () => window.hub.toggleDnd());
dndButton.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.hub.dndMenu();
});
menuButton.addEventListener('click', () => window.hub.appMenu());
// Un fichier lâché sur la barre ne doit pas remplacer la page.
for (const type of ['dragover', 'drop']) document.addEventListener(type, (event) => event.preventDefault());

window.hub.onState(render);
window.hub.getState().then((initial) => initial && render(initial));
