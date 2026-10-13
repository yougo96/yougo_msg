const form = document.getElementById('form');
const input = document.getElementById('value');
const done = (value) => window.tool.invoke('prompt:done', value);

window.tool.invoke('prompt:init').then((options) => {
  if (!options) return;
  document.getElementById('label').textContent = options.label;
  input.value = options.value;
  input.placeholder = options.placeholder;
  input.select();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  done(input.value);
});
document.getElementById('cancel').addEventListener('click', () => done(null));
document.addEventListener('keydown', (event) => event.key === 'Escape' && done(null));
