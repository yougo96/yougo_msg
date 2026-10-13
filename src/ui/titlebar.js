// Bande de titre à la DA (Windows) : la fenêtre n'a plus de barre native, ses boutons sont posés par-dessus
// la bande. La hauteur arrive dans l'adresse de la page (?titlebar=32) ; 0 ou absente : barre native (Linux).
(() => {
  const height = Number(new URLSearchParams(location.search).get('titlebar')) || 0;
  if (!height) return;
  document.documentElement.style.setProperty('--titlebar-height', `${height}px`);
  document.body.classList.add('has-titlebar');
  const bar = document.createElement('div');
  bar.className = 'titlebar';
  bar.id = 'titlebar';
  bar.textContent = document.title;
  document.body.prepend(bar);
})();
