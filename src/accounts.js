// Comptes : une instance d'une messagerie du catalogue, avec sa propre session (partition persist:<id>).
// L'id d'un compte ne change jamais : il nomme sa partition, donc ses connexions. Le premier compte d'une
// messagerie porte l'id de la messagerie (compatibilité avec les sessions du POC).

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function defaultAccounts(catalog) {
  return catalog.filter((service) => service.enabled !== false).map((service) => ({ id: service.id, service: service.id }));
}

// Jamais l'id nu de la messagerie : la partition d'un compte retiré n'est effacée qu'au démarrage suivant.
function newAccountId(serviceId, existingIds, now = Date.now()) {
  let id = `${serviceId}-${now.toString(36)}`;
  for (let n = 2; existingIds.includes(id); n += 1) id = `${serviceId}-${now.toString(36)}${n}`;
  return id;
}

// Comptes affichables, dans l'ordre, avec le nom et le numéro calculés ("WhatsApp 2").
// Un compte dont la messagerie a disparu du catalogue est ignoré, sans être effacé des réglages.
function resolveAccounts(stored, catalogById) {
  const totals = {};
  for (const account of stored) if (catalogById.has(account.service)) totals[account.service] = (totals[account.service] ?? 0) + 1;
  const seen = {};
  return stored
    .filter((account) => catalogById.has(account.service))
    .map((account) => {
      const service = catalogById.get(account.service);
      const number = (seen[account.service] = (seen[account.service] ?? 0) + 1);
      const defaultName = number > 1 ? `${service.name} ${number}` : service.name;
      return {
        ...account,
        service,
        number,
        shared: totals[account.service] > 1,
        name: account.name || defaultName,
      };
    });
}

function moveAccount(stored, id, delta) {
  const index = stored.findIndex((account) => account.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= stored.length) return stored;
  const copy = [...stored];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

// Glisser-déposer : `id` est placé juste avant (ou après) `targetId`.
function placeAccount(stored, id, targetId, after = false) {
  const moving = stored.find((account) => account.id === id);
  if (!moving || id === targetId || !stored.some((account) => account.id === targetId)) return stored;
  const rest = stored.filter((account) => account.id !== id);
  const index = rest.findIndex((account) => account.id === targetId) + (after ? 1 : 0);
  return [...rest.slice(0, index), moving, ...rest.slice(index)];
}

module.exports = { ID_PATTERN, defaultAccounts, newAccountId, resolveAccounts, moveAccount, placeAccount };
