import { icon, ICON_SIZE } from './icons.js';
import { switchField } from './fields.js';
import { activePlane, getActiveLayer, POLAR_GRID, snapToGrid, snapToPolarGrid, STAGE } from '../scene.js';
import { planeMatrix, unproject } from '../plane.js';

/* Préférence d'écran, pas du dessin : hors de la scène, donc hors de
   l'historique, du JSON et de l'export. */
const SETTINGS_KEY = 'illu/settings';
const GRID_TYPES = { square: 'Carrée', polar: 'Ronde' };
const BOUNDS = { divisions: [2, 100], circles: [1, 50] };
/* Plus dézoomée, la grille est trop dense : illisible et lente à dessiner. */
const GRID_MIN_ZOOM = 0.7;

/* `motion` : animations de l'interface, `null` tant que l'utilisateur n'a pas
   choisi — la préférence du système (`prefers-reduced-motion`) décide alors. */
const DEFAULTS = { grid: false, gridType: 'square', divisions: 10, circles: 8, motion: null };

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
      motion: typeof raw.motion === 'boolean' ? raw.motion : null,
    };
  } catch {
    return DEFAULTS;
  }
};

/* Le seau entier : la grille et les sections repliées du panneau y vivent
   côte à côte, chacun ne réécrit que ses clés. */
const readRaw = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};

const save = (settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readRaw(), ...settings }));
  } catch {
    /* Stockage indisponible (navigation privée) : le réglage vaut pour la session. */
  }
};

/** Sections repliées du panneau de réglages : `{ [clé]: true }`. */
export const loadCollapsed = () => {
  const { collapsed } = readRaw();
  if (!collapsed || typeof collapsed !== 'object') return {};
  return Object.fromEntries(Object.entries(collapsed).filter(([, value]) => value === true));
};

export const saveCollapsed = (collapsed) => save({ collapsed });

const round = (value) => Math.round(value * 100) / 100;

const FLAT = { x0: 0, y0: 0, x1: STAGE.width, y1: STAGE.height };

/* ponytail: plafond de traits par sens — sous un plan presque de chant, les
   bornes dépliées deviennent immenses et les traits se fondent de toute façon. */
const MAX_LINES = 1000;

/* Multiples de `cell` strictement dans ]from, to[ : les bords du plan ne sont pas tracés. */
const steps = (from, to, cell) => {
  const first = Math.floor(from / cell) + 1;
  const count = Math.min(MAX_LINES, Math.ceil(to / cell) - first);
  return Array.from({ length: Math.max(0, count) }, (_, i) => round((first + i) * cell));
};

/* Boîte, dans le repère du plan, des coins de la zone visible ramenés de l'écran. */
const unfolded = (plane, view = FLAT) => {
  if (!plane) return view;
  const matrix = planeMatrix(plane);
  const corners = [view.x0, view.x1].flatMap((x) => [view.y0, view.y1].map((y) => unproject(matrix, { x, y })));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

/* Nombre de cercles de la grille ronde : `circles` jusqu'au bord du plan,
   puis autant qu'il en faut, au même pas, pour atteindre les coins de l'écran
   (déplié en 3D). */
const ringCount = (circles, bounds) => {
  const { center, radius } = POLAR_GRID;
  const reach = Math.max(
    ...[bounds.x0, bounds.x1].flatMap((x) => [bounds.y0, bounds.y1].map((y) => Math.hypot(x - center.x, y - center.y))),
  );
  return Math.min(MAX_LINES, Math.max(circles, Math.ceil((reach * circles) / radius)));
};

/**
 * Tracé de la grille, en unités du plan (viewBox de la scène). Elle couvre
 * `bounds` — la zone visible à plat, ou ce que l'écran montre du plan 3D une
 * fois déplié.
 */
const gridPath = ({ gridType, divisions, circles }, bounds = FLAT) => {
  if (gridType === 'square') {
    const { x0, y0, x1, y1 } = bounds;
    return [
      ...steps(x0, x1, STAGE.width / divisions).map((x) => `M${x} ${round(y0)}V${round(y1)}`),
      ...steps(y0, y1, STAGE.height / divisions).map((y) => `M${round(x0)} ${y}H${round(x1)}`),
    ].join('');
  }
  const { center, radius: unit } = POLAR_GRID;
  const count = ringCount(circles, bounds);
  const radius = (unit * count) / circles;
  const arcs = [];
  for (let k = 1; k <= count; k++) {
    const r = round((unit * k) / circles);
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
 * La grille est une image SVG en fond du `<svg>` : même viewBox que la vue
 * (`view`, zone visible), redessinée quand elle bouge ; l'export (qui ne
 * sérialise que le DOM) l'ignore.
 * Avec un `plane`, elle est projetée comme le calque : l'aimantation se fait
 * dans le repère du plan, les croisements visibles sont ceux qui aimantent.
 */
export const gridImage = (settings, color, plane = null, view = FLAT) => {
  const m = plane && planeMatrix(plane);
  const bounds = unfolded(plane, view);
  const transform = m ? ` transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(round).join(' ')})"` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0].map(round).join(' ')}" preserveAspectRatio="none">` +
    `<path d="${gridPath(settings, bounds)}"${transform} fill="none" stroke="${color}" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
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
 * Bascule de la grille, bouton Paramètres et son panneau.
 *
 * ponytail: `popover` natif — non modal pour voir la grille changer en direct,
 * Échap et clic extérieur le ferment d'eux-mêmes.
 */
export const mountSettings = ({ store, svgRoot, container, view = null }) => {
  let settings = load();
  const currentPlane = () => (store ? activePlane(getActiveLayer(store.get())) : null);
  let plane = currentPlane();
  const visible = () => view?.visible() ?? FLAT;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || 'gray'; /* sans feuille de style (tests) */

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

  /* RGAA 13.8 : tout mouvement de l'interface se coupe ici (`data-motion` sur
     la racine, voir `style.css`). */
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const motionToggle = document.createElement('input');
  motionToggle.type = 'checkbox';
  motionToggle.id = 'settings-motion';

  const divisions = numberInput('settings-divisions', 'divisions');
  const circles = numberInput('settings-circles', 'circles');
  const circlesField = field('Cercles', circles);

  const apply = () => {
    gridToggle.checked = settings.grid;
    gridType.value = settings.gridType;
    divisions.value = String(settings.divisions);
    circles.value = String(settings.circles);
    circlesField.hidden = settings.gridType !== 'polar';
    const motion = settings.motion ?? !reduced?.matches;
    motionToggle.checked = motion;
    document.documentElement.dataset.motion = motion ? 'on' : 'off';
    svgRoot.toggleAttribute('data-grid', settings.grid);
    /* Masquée seulement : la case reste cochée et l'aimantation agit. */
    const shown = settings.grid && (view?.zoom() ?? 1) >= GRID_MIN_ZOOM;
    svgRoot.style.backgroundImage = shown ? gridImage(settings, color, plane, visible()) : '';
  };

  /* La grille suit le plan du calque actif ; ne la redessiner que s'il change. */
  store?.subscribe(() => {
    const next = currentPlane();
    if (next?.tilt === plane?.tilt && next?.heading === plane?.heading) return;
    plane = next;
    apply();
  });

  const update = (patch) => {
    settings = { ...settings, ...patch };
    save(settings);
    apply();
  };

  gridToggle.addEventListener('change', () => update({ grid: gridToggle.checked }));
  gridType.addEventListener('change', () => update({ gridType: gridType.value }));
  divisions.addEventListener('change', () => update({ divisions: clampSetting('divisions', divisions.value) }));
  circles.addEventListener('change', () => update({ circles: clampSetting('circles', circles.value) }));
  motionToggle.addEventListener('change', () => update({ motion: motionToggle.checked }));
  reduced?.addEventListener?.('change', () => settings.motion === null && apply());

  panel.append(
    title,
    field('Type', gridType),
    field('Divisions', divisions),
    circlesField,
    switchField('Animations', motionToggle),
  );

  /* La case reste une vraie case : la pastille n'en est que l'habillage, pressée
     quand la grille est affichée. */
  const toggle = document.createElement('label');
  toggle.className = 'pill-btn pill-toggle';
  toggle.title = 'Grille (aimante les points)';
  toggle.append(gridToggle, icon('grid', ICON_SIZE.md), 'Grille');

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'pill-btn is-square';
  open.textContent = '⚙';
  open.title = 'Paramètres';
  open.setAttribute('aria-label', 'Paramètres');
  open.setAttribute('popovertarget', panel.id);

  const separator = document.createElement('span');
  separator.className = 'pill-sep';
  container.append(separator, toggle, open, panel);
  apply();
  view?.onChange(() => settings.grid && apply());

  const snap = (point) => {
    if (!settings.grid) return point;
    return settings.gridType === 'polar'
      ? snapToPolarGrid(point, settings.circles, settings.divisions, ringCount(settings.circles, unfolded(plane, visible())))
      : snapToGrid(point, settings.divisions);
  };
  return { snap };
};
