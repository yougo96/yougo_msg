// Dessine l'icône de l'app et ses pastilles de non-lus, à la DA de pradierh.fr (même dessin qu'assets/icon.svg).
// La barre latérale les dessine pour la zone de notification et la barre des tâches (le process principal n'a pas
// de canvas) ; scripts/icons.js s'en sert pour régénérer assets/icon.png, icon.ico et badge.png (npm run icons).
window.badgeArt = (() => {
  const BG = '#13151a';
  const ACCENT = '#3991ea'; // hsl(210, 81%, 57%)
  const ACCENT_LIGHT = '#b9d9f8';
  const ON_ACCENT = '#08213d';

  // Grille de 512 : carré sombre aux angles vifs, filet du cadre, une bulle en filet blanc (les autres conversations)
  // derrière une bulle bleue pleine. En petit (≤ 32 px), dessin simplifié : traits d'au moins un pixel, sans halo.
  function drawIcon(ctx, size) {
    const small = size <= 32;
    const pixel = 512 / size;
    ctx.save();
    ctx.scale(size / 512, size / 512);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, 512, 512);
    if (!small) {
      const glow = ctx.createRadialGradient(64, 32, 0, 64, 32, 420);
      glow.addColorStop(0, '#22474e');
      glow.addColorStop(1, 'rgba(34, 71, 78, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 512, 512);
    }
    // Filet du cadre : 6 unités en grand, le pixel du bord en petit (l'icône se détache d'une barre sombre).
    const frame = small ? pixel : 6;
    const inset = small ? pixel / 2 : 24;
    ctx.strokeStyle = small ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = frame;
    ctx.strokeRect(inset, inset, 512 - inset * 2, 512 - inset * 2);

    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(18, pixel * 1.25);
    ctx.stroke(new Path2D('M176 96 H416 V344 L336 272 H176 Z'));

    ctx.fillStyle = ACCENT;
    ctx.fill(new Path2D('M96 184 H344 V368 H168 L96 432 Z'));
    if (size >= 24) {
      ctx.fillStyle = BG;
      for (const x of [146, 204, 262]) ctx.fillRect(x, 260, 32, 32);
    }
    ctx.restore();
  }

  // Pastille carrée (angles vifs, comme la barre latérale) en haut à droite, ou seule (`alone`) pour la barre des
  // tâches. Bleue avec le nombre en sombre ; « dot » : non-lus sans nombre (seule : en bleu clair).
  function drawBadge(ctx, size, text, { alone = false } = {}) {
    const dot = text === 'dot';
    if (alone) {
      ctx.fillStyle = dot ? ACCENT_LIGHT : ACCENT;
      if (dot) {
        const side = Math.round(size * 0.56);
        const offset = (size - side) / 2;
        ctx.fillRect(offset, offset, side, side);
        return;
      }
      ctx.fillRect(0, 0, size, size);
    } else {
      const height = Math.round(size * (dot ? 0.4 : 0.6));
      ctx.font = `700 ${Math.round(height * (text.length > 2 ? 0.56 : 0.72))}px "Segoe UI", system-ui, sans-serif`;
      const width = dot ? height : Math.min(size, Math.max(height, Math.ceil(ctx.measureText(text).width + height * 0.45)));
      const x = size - width;
      // Liseré sombre : sépare la pastille du dessin de l'icône.
      const ring = Math.max(1, Math.round(size / 24));
      ctx.fillStyle = BG;
      ctx.fillRect(x - ring, 0, width + ring, height + ring);
      // Bleu franc même sans nombre : le bleu clair se perdrait sur une barre des tâches claire.
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x, 0, width, height);
      if (dot) return;
      ctx.fillStyle = ON_ACCENT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + width / 2, height / 2 + height * 0.04);
      return;
    }
    if (!text.trim()) return;
    ctx.font = `700 ${Math.round(size * (text.length > 2 ? 0.5 : 0.68))}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = ON_ACCENT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + size * 0.04);
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

  return {
    images,
    icon: (size) => render(size, drawIcon),
    // Pastille de secours de la barre des tâches, sans nombre (assets/badge.png).
    badge: (size) => render(size, (ctx) => drawBadge(ctx, size, ' ', { alone: true })),
  };
})();
