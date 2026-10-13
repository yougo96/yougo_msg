const rows = document.getElementById('rows');
let last = null;

const STATUS = {
  ready: ['Connecté', 'ok'],
  login: ['Connexion requise', 'warn'],
  loading: ['Chargement', ''],
  waiting: ['En attente', ''],
  offline: ['Hors ligne', 'bad'],
  crashed: ['Plantée', 'bad'],
  unresponsive: ['Ne répond plus', 'bad'],
};
const SOURCE = { badge: 'pastille de la page', page: 'lecture de la page', title: 'titre', favicon: 'favicon' };

function cell(text, detail, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.append(document.createTextNode(text));
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    small.title = detail;
    td.append(small);
  }
  return td;
}

const unreadText = (unread) => (unread?.count === null || unread?.count === undefined ? (unread?.dot ? '•' : '?') : `${unread.count}${unread.dot ? ' •' : ''}`);

function probeText(probe) {
  if (!probe) return '';
  const age = Math.round((Date.now() - probe.at) / 1000);
  return probe.error ? `lecture : erreur (${probe.error}) il y a ${age} s` : `lecture : ${JSON.stringify(probe.result)} il y a ${age} s`;
}

function render(snapshot) {
  last = snapshot;
  document.getElementById('summary').textContent = [
    `HP Message ${snapshot.version}`,
    `Electron ${snapshot.versions.electron} (Chromium ${snapshot.versions.chrome})`,
    snapshot.platform,
    `démarré il y a ${snapshot.uptimeMin} min`,
    `mémoire ${snapshot.memoryKind} : ${(snapshot.totalMb / 1024).toFixed(2)} Go sur ${(snapshot.systemMb / 1024).toFixed(0)} Go`,
    `ne pas déranger : ${snapshot.dnd.toLowerCase()}`,
  ].join(' · ');
  const warning = document.getElementById('warning');
  warning.hidden = !snapshot.electronOld;
  warning.textContent = snapshot.electronOld ? `Electron a ${snapshot.electronAgeDays} jours : pensez à le mettre à jour (npm run update:electron puis npm run dist).` : '';

  rows.replaceChildren(
    ...snapshot.accounts.map((account) => {
      const tr = document.createElement('tr');
      const [label, className] = STATUS[account.status] ?? [account.status, ''];
      const stats = account.notifications ?? { page: 0, fallback: 0, suppressed: 0 };
      tr.append(
        cell(account.name, `${account.id}${account.muted ? ' · notifications coupées' : ''}`),
        cell(label, [account.error, account.crashes ? `${account.crashes} plantage(s)` : ''].filter(Boolean).join(' · '), className),
        cell(unreadText(account.unread)),
        cell(SOURCE[account.unread?.source] ?? '—', [account.title && `titre : « ${account.title} »`, probeText(account.probe), account.favicon && `favicon : ${account.favicon}`].filter(Boolean).join('\n')),
        cell(`${stats.page} / ${stats.fallback} / ${stats.suppressed}`, stats.lastAt ? `dernière : ${new Date(stats.lastAt).toLocaleTimeString('fr-FR')}` : ''),
        cell(account.memory ? `${account.memory.mb} Mo (${account.peakMb})` : '—', account.memory ? `${account.memory.processes} processus · ${account.memory.cpu} % CPU` : ''),
        cell(account.visibility, account.audioMuted ? 'son coupé' : '', account.visibility === 'visible' ? 'ok' : ''),
      );
      return tr;
    }),
  );
  document.getElementById('shared').textContent = snapshot.shared.map((entry) => `${entry.name} ${entry.mb} Mo`).join(' · ');
}

// Rapport en texte brut, à coller dans une conversation ou un ticket.
function report(snapshot) {
  const lines = [document.getElementById('summary').textContent, ''];
  for (const account of snapshot.accounts) {
    const stats = account.notifications ?? {};
    lines.push(
      `${account.name} [${account.id}] : ${account.status}, non-lus ${unreadText(account.unread)} (${account.unread?.source ?? '—'}), notifications ${stats.page}/${stats.fallback}/${stats.suppressed}, ${account.memory?.mb ?? '?'} Mo (pic ${account.peakMb}), ${account.visibility}`,
      `  titre : ${account.title}`,
      ...(account.probe ? [`  ${probeText(account.probe)}`] : []),
      ...(account.favicon ? [`  favicon : ${account.favicon}`] : []),
    );
  }
  lines.push('', `Partagés : ${snapshot.shared.map((entry) => `${entry.name} ${entry.mb} Mo`).join(', ')}`);
  return lines.join('\n');
}

async function refresh() {
  const snapshot = await window.tool.invoke('diag:snapshot');
  if (snapshot) render(snapshot);
}

document.getElementById('copy').addEventListener('click', () => last && window.tool.invoke('diag:copy', report(last)));
document.getElementById('logs').addEventListener('click', () => window.tool.invoke('diag:open-logs'));
refresh();
setInterval(refresh, 2000);
