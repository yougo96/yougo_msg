// Dessine les images de la zone de notification et de la barre des tâches, avec la pastille des non-lus.
// Le process principal n'a pas de canvas : il les demande ici. L'icône est redessinée en vectoriel
// (mêmes formes qu'assets/icon.svg), donc nette à toutes les tailles.
window.badgeArt = (() => {
  const RED = '#e5484d';

  function drawIcon(ctx, size) {
    ctx.save();
    ctx.scale(size / 512, size / 512);
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#a855f7');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 512, 112);
    ctx.fill();
    ctx.fillStyle = '#ddd6fe';
    ctx.beginPath();
    ctx.roundRect(236, 196, 196, 172, 48);
    ctx.fill();
    ctx.fill(new Path2D('M368 352 L414 414 L322 362 Z'));
    ctx.fillStyle = '#fff';
    ctx.fill(new Path2D('M152 112 H320 A56 56 0 0 1 376 168 V272 A56 56 0 0 1 320 328 H222 L152 390 V328 A56 56 0 0 1 96 272 V168 A56 56 0 0 1 152 112 Z'));
    ctx.fillStyle = '#7c3aed';
    for (const x of [176, 236, 296]) {
      ctx.beginPath();
      ctx.arc(x, 220, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Pastille : un rond (ou une gélule pour « 12 », « 99+ ») rouge, coin haut droit, ou centrée si `alone`.
  function drawBadge(ctx, size, text, { alone = false } = {}) {
    const dot = text === 'dot';
    const height = alone ? size : Math.round(size * (dot ? 0.42 : 0.62));
    ctx.font = `700 ${Math.round(height * (text.length > 2 ? 0.58 : 0.7))}px "Segoe UI", system-ui, sans-serif`;
    const textWidth = dot ? 0 : ctx.measureText(text).width;
    const width = alone ? size : Math.min(size, Math.max(height, textWidth + height * 0.5));
    const x = size - width;
    const y = 0;
    const radius = dot && alone ? size * 0.32 : height / 2;
    ctx.fillStyle = RED;
    ctx.beginPath();
    if (dot && alone) ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    else ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    if (dot) return;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2 + height * 0.04);
  }

  function render(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    draw(ctx, size);
    return canvas.toDataURL('image/png');
  }

  // key : '' (pas de non-lus), 'dot', ou le texte du nombre ('3', '99+').
  function images(key, platform) {
    const traySizes = platform === 'linux' ? [[64, 1]] : [[16, 1], [24, 1.5], [32, 2]];
    const tray = traySizes.map(([size, scale]) => ({
      scale,
      dataURL: render(size, (ctx) => {
        drawIcon(ctx, size);
        if (key) drawBadge(ctx, size, key);
      }),
    }));
    const overlay = key && platform === 'win32' ? [[16, 1], [32, 2]].map(([size, scale]) => ({ scale, dataURL: render(size, (ctx) => drawBadge(ctx, size, key, { alone: true })) })) : [];
    return { tray, overlay };
  }

  return { images };
})();
