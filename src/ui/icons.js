/* Pictogrammes des outils et des formes, en trait `currentColor` : la couleur
   suit le texte du bouton, pressé ou non. Tracés repris de la maquette E. */
const PATHS = {
  cursor: '<path d="M5 3 L16 11 L11 12 L14 18 L12 19 L9 13 L5 16 Z" fill="currentColor" stroke="none"/>',
  arc: '<path d="M3 13 A7 7 0 0 1 17 13 Z" stroke-linejoin="round"/>',
  ellipse: '<ellipse cx="10" cy="10" rx="8" ry="5"/>',
  polygon: '<path d="M10 2.5 L17 7.5 L14.5 16 L5.5 16 L3 7.5 Z" stroke-linejoin="round"/>',
  rect: '<rect x="3.5" y="5" width="13" height="10"/>',
  line: '<line x1="4" y1="16" x2="16" y2="4" stroke-linecap="round"/>',
  point: '<circle cx="10" cy="10" r="3.5" fill="currentColor" stroke="none"/>',
  polyline: '<path d="M3 15 L7 6 L11 13 L17 4" stroke-linejoin="round" stroke-linecap="round"/>',
  grid: '<rect x="2.5" y="2.5" width="15" height="15"/><path d="M7.5 2.5V17.5M12.5 2.5V17.5M2.5 7.5H17.5M2.5 12.5H17.5"/>',
  eye: '<path d="M2 10 C5 4.5 15 4.5 18 10 C15 15.5 5 15.5 2 10 Z" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.5"/>',
  eyeOff: '<path d="M2 10 C5 4.5 15 4.5 18 10 C15 15.5 5 15.5 2 10 Z" stroke-linejoin="round"/><path d="M4 16 L16 4" stroke-linecap="round"/>',
  /* Plan 3D du calque : un cube, barré quand le calque est à plat. */
  cube: '<path d="M10 2.5 L16.5 6.25 V13.75 L10 17.5 L3.5 13.75 V6.25 Z M3.5 6.25 L10 10 L16.5 6.25 M10 10 V17.5" stroke-linejoin="round"/>',
  cubeOff:
    '<path d="M10 2.5 L16.5 6.25 V13.75 L10 17.5 L3.5 13.75 V6.25 Z" stroke-linejoin="round"/><path d="M4 16 L16 4" stroke-linecap="round"/>',
  chevronDown: '<path d="M5 8 L10 13 L15 8" stroke-linecap="round" stroke-linejoin="round"/>',
  /* Poignée de glisser-déposer : deux colonnes de trois points. */
  grip: [7, 13].flatMap((x) => [5, 10, 15].map((y) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor" stroke="none"/>`)).join(''),
  chevronRight: '<path d="M8 5 L13 10 L8 15" stroke-linecap="round" stroke-linejoin="round"/>',
};

export const icon = (name, size = 20) => {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">` +
    `${PATHS[name] ?? ''}</svg>`;
  return wrap;
};
