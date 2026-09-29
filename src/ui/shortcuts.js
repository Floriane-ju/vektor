import { icon, ICON_SIZE } from './icons.js';
import {
  duplicateElements,
  duplicateLayer,
  getActiveElement,
  getActiveLayer,
  removeElements,
  removeLayer,
  selectedIds,
  selectElements,
  SHAPES,
  translateElements,
} from '../scene.js';
import { pillButton } from './fields.js';

/* Une touche par outil. `cursor` n'est pas une forme mais partage le sélecteur. */
export const TOOL_KEYS = {
  v: 'cursor',
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
export const DUPLICATE_OFFSET = 10;

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
  ['Suppr', 'Supprimer les formes sélectionnées (sinon le calque)'],
  ['⌘/Ctrl + D', 'Dupliquer les formes sélectionnées (sinon le calque)'],
  ['Maj + clic', 'Ajouter / retirer une forme de la sélection'],
  ['Glisser dans le vide', 'Sélectionner au lasso (Maj : ajouter)'],
  ['Échap', 'Désélectionner'],
  ['Flèches', 'Déplacer de 1 px (Maj : 10 px)'],
  ['↑ / ↓', 'Dans la liste : passer à la ligne voisine'],
  ['Suppr / ⌫', 'Dans la liste : supprimer la ligne qui a le focus'],
  ['Alt + ↑ / ↓', 'Sur un calque ou une forme de la liste : le monter / descendre'],
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
  /* `submit` : le formulaire `method="dialog"` ferme la fenêtre. */
  const close = pillButton('Fermer', { className: 'is-primary', type: 'submit' });
  form.append(close);
  dialog.append(title, list, form);

  const open = pillButton(icon('help', ICON_SIZE.lg), {
    title: 'Raccourcis clavier (?)',
    label: 'Raccourcis clavier',
    className: 'is-square',
    onClick: () => dialog.showModal?.(),
  });

  const separator = document.createElement('span');
  separator.className = 'pill-sep';
  container.append(separator, open, dialog);
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
    /* Calque verrouillé : ni suppression, ni déplacement au clavier. */
    const locked = getActiveLayer(store.get())?.locked === true;
    const element = getActiveElement(store.get());
    const ids = selectedIds(store.get());

    if (mod) {
      if (key !== 'd') return;
      event.preventDefault();
      if (element) store.apply(duplicateElements, ids, DUPLICATE_OFFSET);
      else if (store.get().activeLayerId) store.apply(duplicateLayer, store.get().activeLayerId);
      return;
    }

    if (event.key === '?') showHelp();
    else if (TOOL_KEYS[key] && !event.shiftKey) selectTool(TOOL_KEYS[key]);
    else if (event.key === 'Escape') store.apply(selectElements, []);
    else if ((event.key === 'Delete' || event.key === 'Backspace' || ARROWS[event.key]) && locked) return;
    else if ((event.key === 'Delete' || event.key === 'Backspace') && element) {
      store.apply(removeElements, ids);
      status.show(ids.length > 1 ? `${ids.length} formes supprimées.` : `${SHAPES[element.type].label} supprimé.`);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && getActiveLayer(store.get())) {
      const layer = getActiveLayer(store.get());
      store.apply(removeLayer, layer.id);
      status.show(`« ${layer.name} » supprimé.`);
    } else if (ARROWS[event.key] && element && !target.closest?.(ARROW_OWNER)) {
      const [dx, dy] = ARROWS[event.key];
      const step = event.shiftKey ? NUDGE_FAST : NUDGE;
      store.apply(translateElements, ids, dx * step, dy * step);
    } else return;
    event.preventDefault();
  });
};
