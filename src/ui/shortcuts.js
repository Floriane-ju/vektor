import {
  duplicateElement,
  getActiveElement,
  removeElement,
  setActiveElement,
  SHAPES,
  updateElement,
} from '../scene.js';

/* Une touche par outil. `cursor` n'est pas une forme mais partage le sélecteur. */
export const TOOL_KEYS = {
  v: 'cursor',
  c: 'circle',
  a: 'arc',
  e: 'ellipse',
  p: 'polygon',
  t: 'polyline',
  d: 'point',
  r: 'rect',
  l: 'line',
};

const NUDGE = 1;
const NUDGE_FAST = 10;
const DUPLICATE_OFFSET = 10;

const ARROWS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/* Là, les touches appartiennent à la saisie. Un radio ou une case gardent
   leurs lettres pour nous, pas leurs flèches (navigation native du groupe). */
const TEXT_ENTRY = 'input:not([type="radio"], [type="checkbox"]), textarea, select, [contenteditable]';
const ARROW_OWNER = 'input, textarea, select, [contenteditable]';

const toolLabel = (type) => (type === 'cursor' ? 'Curseur' : SHAPES[type].label);

const LIST = [
  ...Object.entries(TOOL_KEYS).map(([key, type]) => [key.toUpperCase(), toolLabel(type)]),
  ['Suppr', 'Supprimer la forme sélectionnée'],
  ['⌘/Ctrl + D', 'Dupliquer la forme sélectionnée'],
  ['Échap', 'Désélectionner'],
  ['Flèches', 'Déplacer de 1 px (Maj : 10 px)'],
  ['⌘/Ctrl + Z', 'Annuler (Maj : rétablir)'],
  ['⌘/Ctrl + + / − / 0', 'Zoomer / dézoomer / ajuster'],
  ['?', 'Afficher cette liste'],
];

/* ponytail: `<dialog>` natif — Échap, focus piégé et fond gérés par le navigateur. */
const mountHelp = (container) => {
  const dialog = document.createElement('dialog');
  dialog.className = 'shortcuts';
  dialog.setAttribute('aria-labelledby', 'shortcuts-title');
  const title = document.createElement('h2');
  title.id = 'shortcuts-title';
  title.textContent = 'Raccourcis clavier';
  const list = document.createElement('dl');
  for (const [key, action] of LIST) {
    const dt = document.createElement('dt');
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    dt.append(kbd);
    const dd = document.createElement('dd');
    dd.textContent = action;
    list.append(dt, dd);
  }
  const form = document.createElement('form');
  form.method = 'dialog';
  const close = document.createElement('button');
  close.textContent = 'Fermer';
  form.append(close);
  dialog.append(title, list, form);

  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = '?';
  open.title = 'Raccourcis clavier (?)';
  open.setAttribute('aria-label', 'Raccourcis clavier');
  open.addEventListener('click', () => dialog.showModal?.());

  container.append(open, dialog);
  return () => dialog.showModal?.();
};

export const mountShortcuts = ({ store, container, status }) => {
  const showHelp = mountHelp(container);

  const selectTool = (type) => document.getElementById(`shape-${type}`)?.click();

  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey) return;
    const target = event.target;
    if (target.closest?.('dialog, ' + TEXT_ENTRY)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const element = getActiveElement(store.get());

    if (mod) {
      if (key !== 'd') return;
      event.preventDefault();
      if (element) store.apply(duplicateElement, element.id, DUPLICATE_OFFSET);
      return;
    }

    if (event.key === '?') showHelp();
    else if (TOOL_KEYS[key] && !event.shiftKey) selectTool(TOOL_KEYS[key]);
    else if (event.key === 'Escape') store.apply(setActiveElement, null);
    else if ((event.key === 'Delete' || event.key === 'Backspace') && element) {
      store.apply(removeElement, element.id);
      status.show(`${SHAPES[element.type].label} supprimé.`);
    } else if (ARROWS[event.key] && element && !target.closest?.(ARROW_OWNER)) {
      const [dx, dy] = ARROWS[event.key];
      const step = event.shiftKey ? NUDGE_FAST : NUDGE;
      store.apply(updateElement, element.id, { x: element.x + dx * step, y: element.y + dy * step });
    } else return;
    event.preventDefault();
  });
};
