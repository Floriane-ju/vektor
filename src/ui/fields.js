/* Briques DOM des panneaux de réglages : partagées par le panneau de droite et
   la section « Répéter », qui se monte pour le calque comme pour la forme. */
import { icon } from './icons.js';
import { loadCollapsed, saveCollapsed } from './settings.js';

let uid = 0;
export const nextId = () => `prop-${++uid}`;

export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export const field = (labelText, control) => {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
};

export const row = (...children) => {
  const node = el('div', 'field-row');
  node.append(...children);
  return node;
};

export const separator = () => el('hr', 'separator');

const option = (value, label) => {
  const node = el('option', null, label);
  node.value = value;
  return node;
};

export const input = (type, attrs = {}) => {
  const node = document.createElement('input');
  node.type = type;
  node.id = nextId();
  Object.assign(node, attrs);
  return node;
};

export const select = (entries) => {
  const node = document.createElement('select');
  node.id = nextId();
  for (const [value, label] of entries) node.append(option(value, label));
  return node;
};

/* Case à cocher habillée en interrupteur ; la case reste native. */
export const switchField = (labelText, checkbox) => {
  checkbox.classList.add('switch');
  const label = el('label', 'switch-field');
  label.append(el('span', null, labelText), checkbox);
  return label;
};

/* Entête d'une section : titre, et son bouton d'ajout à droite. */
export const sectionHead = (title, addButton) => {
  const head = el('div', 'section-head');
  head.append(el('h3', null, title), addButton);
  return head;
};

export const addButtonFor = (label, focusKey, onClick) => {
  const node = el('button', 'text-btn', '+ Ajouter');
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  node.dataset.focusKey = focusKey;
  node.addEventListener('click', onClick);
  return node;
};

/**
 * Curseur doublé d'un champ numérique : le curseur pour le geste, le champ
 * pour une valeur précise ou hors des bornes du curseur. `bind` relie chacun
 * des deux à la même lecture et la même écriture.
 */
export const slider = (bind, labelText, attrs, read, write, options = {}) => {
  const range = bind(input('range', attrs), read, write, options);
  const number = bind(input('number', { step: attrs.step, min: attrs.min }), read, write, {
    ...options,
    event: 'change',
  });
  number.className = 'range-value';
  number.setAttribute('aria-label', labelText);
  const wrap = el('div', 'field slider-field');
  const head = el('div', 'slider-head');
  const label = el('label', null, labelText);
  label.htmlFor = range.id;
  head.append(label, number);
  wrap.append(head, range);
  return wrap;
};

/* Sections repliées, par clé : la même clé sert au calque et à la forme, donc
   replier « Répéter » d'un côté le replie de l'autre. */
let collapsed = null;
const refreshers = new Set();

/**
 * Rend la section repliable par son titre : un bouton natif dans le `h3`
 * (Entrée et Espace au clavier), `aria-expanded` et chevron à jour. Repliée,
 * seul l'entête reste, avec le résumé que la section pose par `summarize`.
 */
export const collapsible = (section, head, key) => {
  collapsed ??= loadCollapsed();
  const title = head.querySelector('h3');
  const button = el('button', 'section-toggle');
  button.type = 'button';
  const summary = el('span', 'section-summary');
  button.append(icon('chevronDown', 14), el('span', 'section-title', title.textContent), summary);
  title.replaceChildren(button);
  const refresh = () => {
    const open = collapsed[key] !== true;
    section.classList.toggle('is-collapsed', !open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => {
    const { [key]: was, ...rest } = collapsed;
    collapsed = was ? rest : { ...rest, [key]: true };
    saveCollapsed(collapsed);
    for (const other of refreshers) other();
  });
  refreshers.add(refresh);
  refresh();
  return { summarize: (text) => { summary.textContent = text; } };
};

/** « 1 étage », « 3 étages ». */
export const countLabel = (count, noun) => `${count} ${noun}${count > 1 ? 's' : ''}`;
