import { POLAR_GRID, snapToGrid, snapToPolarGrid, STAGE } from '../scene.js';

/* Préférence d'écran, pas du dessin : hors de la scène, donc hors de
   l'historique, du JSON et de l'export. */
const SETTINGS_KEY = 'illu/settings';
const GRID_TYPES = { square: 'Carrée', polar: 'Ronde' };
const BOUNDS = { divisions: [2, 100], circles: [1, 50] };
const DEFAULTS = { grid: false, gridType: 'square', divisions: 10, circles: 8 };

const clampSetting = (name, value) => {
  const [min, max] = BOUNDS[name];
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULTS[name];
};

const load = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') ?? {};
    return {
      grid: raw.grid === true,
      gridType: Object.hasOwn(GRID_TYPES, raw.gridType) ? raw.gridType : DEFAULTS.gridType,
      divisions: clampSetting('divisions', raw.divisions ?? DEFAULTS.divisions),
      circles: clampSetting('circles', raw.circles ?? DEFAULTS.circles),
    };
  } catch {
    return DEFAULTS;
  }
};

const save = (settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Stockage indisponible (navigation privée) : le réglage vaut pour la session. */
  }
};

const round = (value) => Math.round(value * 100) / 100;

/** Tracé de la grille, en unités du plan (viewBox de la scène). */
const gridPath = ({ gridType, divisions, circles }) => {
  if (gridType === 'square') {
    const lines = [];
    for (let i = 1; i < divisions; i++) {
      const x = round((STAGE.width * i) / divisions);
      const y = round((STAGE.height * i) / divisions);
      lines.push(`M${x} 0V${STAGE.height}`, `M0 ${y}H${STAGE.width}`);
    }
    return lines.join('');
  }
  const { center, radius } = POLAR_GRID;
  const arcs = [];
  for (let k = 1; k <= circles; k++) {
    const r = round((radius * k) / circles);
    arcs.push(`M${center.x - r} ${center.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`);
  }
  for (let j = 0; j < divisions; j++) {
    const angle = (2 * Math.PI * j) / divisions;
    arcs.push(
      `M${center.x} ${center.y}L${round(center.x + radius * Math.sin(angle))} ${round(center.y - radius * Math.cos(angle))}`,
    );
  }
  return arcs.join('');
};

/**
 * La grille est une image SVG en fond du `<svg>` : même viewBox que la scène,
 * donc elle suit le zoom, et l'export (qui ne sérialise que le DOM) l'ignore.
 */
export const gridImage = (settings, color) => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STAGE.width} ${STAGE.height}">` +
    `<path d="${gridPath(settings)}" fill="none" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const field = (labelText, input) => {
  const label = document.createElement('label');
  label.className = 'settings-field';
  if (input.type === 'checkbox') label.append(input, labelText);
  else label.append(labelText, input);
  return label;
};

const numberInput = (id, name) => {
  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  [input.min, input.max] = BOUNDS[name].map(String);
  return input;
};

/**
 * Bouton Paramètres et son panneau.
 *
 * ponytail: `popover` natif — non modal pour voir la grille changer en direct,
 * Échap et clic extérieur le ferment d'eux-mêmes.
 */
export const mountSettings = ({ svgRoot, container }) => {
  let settings = load();
  const color = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#2b2f37';

  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.className = 'settings';
  panel.popover = 'auto';
  panel.setAttribute('aria-labelledby', 'settings-title');

  const title = document.createElement('h2');
  title.id = 'settings-title';
  title.textContent = 'Paramètres';

  const gridToggle = document.createElement('input');
  gridToggle.type = 'checkbox';
  gridToggle.id = 'settings-grid';

  const gridType = document.createElement('select');
  gridType.id = 'settings-grid-type';
  for (const [value, label] of Object.entries(GRID_TYPES)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    gridType.append(option);
  }

  const divisions = numberInput('settings-divisions', 'divisions');
  const circles = numberInput('settings-circles', 'circles');
  const circlesField = field('Cercles', circles);

  const apply = () => {
    gridToggle.checked = settings.grid;
    gridType.value = settings.gridType;
    divisions.value = String(settings.divisions);
    circles.value = String(settings.circles);
    circlesField.hidden = settings.gridType !== 'polar';
    svgRoot.toggleAttribute('data-grid', settings.grid);
    svgRoot.style.backgroundImage = settings.grid ? gridImage(settings, color) : '';
  };

  const update = (patch) => {
    settings = { ...settings, ...patch };
    save(settings);
    apply();
  };

  gridToggle.addEventListener('change', () => update({ grid: gridToggle.checked }));
  gridType.addEventListener('change', () => update({ gridType: gridType.value }));
  divisions.addEventListener('change', () => update({ divisions: clampSetting('divisions', divisions.value) }));
  circles.addEventListener('change', () => update({ circles: clampSetting('circles', circles.value) }));

  panel.append(
    title,
    field('Grille (aimante les points)', gridToggle),
    field('Type', gridType),
    field('Divisions', divisions),
    circlesField,
  );

  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = '⚙';
  open.title = 'Paramètres';
  open.setAttribute('aria-label', 'Paramètres');
  open.setAttribute('popovertarget', panel.id);

  container.append(open, panel);
  apply();

  const snap = (point) => {
    if (!settings.grid) return point;
    return settings.gridType === 'polar'
      ? snapToPolarGrid(point, settings.circles, settings.divisions)
      : snapToGrid(point, settings.divisions);
  };
  return { snap };
};
