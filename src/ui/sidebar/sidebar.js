const nav = document.getElementById('accounts');
const dndButton = document.getElementById('dnd');
const menuButton = document.getElementById('menu');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelText = document.getElementById('panel-text');
const panelAction = document.getElementById('panel-action');
const buttons = new Map(); // id -> { button, badge, number }
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

function createButton(account) {
  const button = document.createElement('button');
  button.className = 'account';
  button.draggable = true;
  button.addEventListener('click', () => window.hub.select(account.id));
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.hub.accountMenu(account.id);
  });

  const icon = document.createElement('img');
  icon.src = `icons/${account.serviceId}.png`;
  icon.alt = '';
  icon.draggable = false;
  // Pas d'icône : on retombe sur l'initiale aux couleurs du service.
  icon.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'fallback';
    fallback.textContent = account.serviceName[0];
    icon.replaceWith(fallback);
  });

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.hidden = true;
  const number = document.createElement('span');
  number.className = 'number';
  number.hidden = true;
  button.append(icon, badge, number);
  setupDrag(button, account.id);
  return { button, badge, number };
}

// Réordonner en glissant une icône sur une autre.
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

function badgeContent(account) {
  if (ALERTS.has(account.status)) return { text: '!', className: 'badge alert' };
  const { count, dot } = account.unread;
  if (count) return { text: count > 99 ? '99+' : String(count), className: 'badge' };
  if (dot) return { text: '', className: 'badge dot' };
  return null;
}

function render(next) {
  state = next;
  document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidth}px`);

  // Comptes ajoutés, retirés ou déplacés : on reconstruit la liste.
  const ids = state.accounts.map((account) => account.id).join();
  if (ids !== renderedIds) {
    renderedIds = ids;
    const previous = new Map(buttons);
    buttons.clear();
    for (const account of state.accounts) buttons.set(account.id, previous.get(account.id) ?? createButton(account));
    nav.replaceChildren(...[...buttons.values()].map(({ button }) => button));
  }

  state.accounts.forEach((account, index) => {
    const { button, badge, number } = buttons.get(account.id);
    const shortcut = index < 9 ? `  (Ctrl+${index + 1})` : '';
    button.title = [
      `${account.name}${shortcut}`,
      STATUS_TEXT[account.status],
      account.unread.count ? `${account.unread.count} non lu${account.unread.count > 1 ? 's' : ''}` : account.unread.dot ? 'Nouveaux messages' : '',
      account.muted && 'Notifications coupées',
      'Clic droit : notifications, renommer, autre compte…',
    ]
      .filter(Boolean)
      .join('\n');
    button.setAttribute('aria-label', account.name);
    button.style.setProperty('--brand', account.color);
    button.classList.toggle('active', account.id === state.activeId);
    button.classList.toggle('loading', account.status === 'loading' || account.status === 'waiting');
    button.classList.toggle('muted', account.muted);
    const content = badgeContent(account);
    badge.hidden = !content;
    if (content) {
      badge.className = content.className;
      badge.textContent = content.text;
    }
    number.hidden = !account.number;
    number.textContent = account.number || '';
  });

  dndButton.classList.toggle('on', state.dnd.on);
  dndButton.setAttribute('aria-pressed', String(state.dnd.on));
  dndButton.title = `Ne pas déranger : ${state.dnd.label.toLowerCase()}\nClic droit : choisir une durée`;

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
