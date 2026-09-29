/* Seuls pictogrammes sur mesure : les outils de forme, en trait `currentColor`
   (la couleur suit le texte du bouton, pressé ou non). Tracés de la maquette E. */
const PATHS = {
  arc: '<path d="M3 13 A7 7 0 0 1 17 13 Z" stroke-linejoin="round"/>',
  ellipse: '<ellipse cx="10" cy="10" rx="8" ry="5"/>',
  polygon: '<path d="M10 2.5 L17 7.5 L14.5 16 L5.5 16 L3 7.5 Z" stroke-linejoin="round"/>',
  rect: '<rect x="3.5" y="5" width="13" height="10"/>',
  line: '<line x1="4" y1="16" x2="16" y2="4" stroke-linecap="round"/>',
  point: '<circle cx="10" cy="10" r="3.5" fill="currentColor" stroke="none"/>',
  polyline: '<path d="M3 15 L7 6 L11 13 L17 4" stroke-linejoin="round" stroke-linecap="round"/>',
};

/* Toute autre icône vient de la typo Material Symbols Rounded (style.css) :
   nom interne → ligature. Jamais de glyphe ASCII/Unicode à la place. */
const SYMBOLS = {
  cursor: 'arrow_selector_tool',
  grid: 'grid_on',
  eye: 'visibility',
  eyeOff: 'visibility_off',
  /* Plan 3D du calque : barré quand le calque est à plat. */
  cube: 'view_in_ar',
  cubeOff: 'view_in_ar_off',
  lock: 'lock',
  lockOff: 'lock_open',
  /* Calque suspendu (trop de copies). */
  warning: 'warning',
  chevronDown: 'expand_more',
  chevronRight: 'chevron_right',
  /* Poignée de glisser-déposer. */
  grip: 'drag_indicator',
  plus: 'add',
  minus: 'remove',
  close: 'close',
  up: 'arrow_upward',
  down: 'arrow_downward',
  duplicate: 'content_copy',
  settings: 'settings',
  help: 'help',
};

/* Tailles d'icône, en pixels, 16 au minimum : chevrons, boutons de ligne et
   des barres, aperçu d'une forme dans la liste, outils de la barre. */
export const ICON_SIZE = { md: 16, glyph: 18, lg: 20 };

export const icon = (name, size = ICON_SIZE.lg) => {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.setAttribute('aria-hidden', 'true');
  if (!(name in PATHS)) {
    wrap.classList.add('is-symbol');
    wrap.style.setProperty('--icon-size', `${Math.max(size, ICON_SIZE.md)}px`);
    wrap.textContent = SYMBOLS[name] ?? '';
    return wrap;
  }
  wrap.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">` +
    `${PATHS[name] ?? ''}</svg>`;
  return wrap;
};
