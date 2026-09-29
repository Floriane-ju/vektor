/* Briques DOM des panneaux de réglages : le seul module de contrôles de
   formulaire, partagé par le panneau de droite et ses sections (répéter,
   interpolations, booléens), montées pour le calque comme pour la forme. */
import { icon, ICON_SIZE } from './icons.js';
import { loadCollapsed, saveCollapsed } from '../persistence.js';

let uid = 0;
const nextId = () => `prop-${++uid}`;

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

/* Bloc du panneau : le trait qui les sépare vient du CSS, seulement entre
   deux blocs visibles — un bloc dont tout est masqué disparaît. */
export const section = (...children) => {
  const node = el('div', 'inspector-section');
  node.append(...children);
  return node;
};

export const option = (value, label) => {
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

/**
 * Relie un contrôle à la cible que `target()` résout au moment du geste :
 * rien n'est écrit sans cible. Une case à cocher écrit son état coché, les
 * autres `parse(node.value)`.
 */
export const bindControl = (node, target, write, { event = 'input', parse = Number } = {}) => {
  node.addEventListener(event, () => {
    /* Champ vidé pour retaper : rien n'est écrit, `Number('')` vaudrait 0. */
    if (node.type === 'number' && node.value === '') return;
    const current = target();
    if (current) write(current, node.type === 'checkbox' ? node.checked : parse(node.value));
  });
  return node;
};

/* Affiche une valeur lue du modèle, sans écraser le champ en cours de saisie. */
export const showValue = (node, value) => {
  if (node.type === 'checkbox') node.checked = Boolean(value);
  else if (document.activeElement !== node) node.value = value;
};

/**
 * Choix exclusif en segments : des radios natifs, donc flèches et annonce du
 * groupe par le navigateur. `onPick(value)` à chaque radio coché ; `check`
 * coche la valeur lue du modèle. `focusKeyOf(value)` : clé de focus des
 * radios d'une section reconstruite.
 */
export const segmented = (legendText, entries, onPick, focusKeyOf = null) => {
  const root = el('fieldset', 'segmented');
  const track = el('div', 'segments');
  root.append(el('legend', null, legendText), track);
  const name = nextId();
  const radios = entries.map(([value, label]) => {
    const radio = input('radio', { name, value });
    if (focusKeyOf) radio.dataset.focusKey = focusKeyOf(value);
    radio.addEventListener('change', () => {
      if (radio.checked) onPick(value);
    });
    const wrap = el('label', 'segment');
    wrap.append(radio, el('span', null, label));
    track.append(wrap);
    return radio;
  });
  const check = (value) => {
    for (const radio of radios) radio.checked = radio.value === value;
  };
  return { root, check };
};

/* Case à cocher habillée en interrupteur ; la case reste native. */
export const switchField = (labelText, checkbox) => {
  checkbox.classList.add('switch');
  const label = el('label', 'switch-field');
  label.append(el('span', null, labelText), checkbox);
  return label;
};

/* Entête d'une section : titre, et son éventuel bouton d'ajout à droite. */
export const sectionHead = (title, addButton = null) => {
  const head = el('div', 'section-head');
  head.append(el('h3', null, title), ...(addButton ? [addButton] : []));
  return head;
};

/* Bouton texte d'une section ; `content` : texte ou nœuds (icône comprise),
   `label` = infobulle et nom accessible. */
export const textButton = (content, { label = null, focusKey, onClick, className = 'text-btn' }) => {
  const node = el('button', className);
  node.append(...[content].flat());
  node.type = 'button';
  if (label) {
    node.setAttribute('aria-label', label);
    node.title = label;
  }
  node.dataset.focusKey = focusKey;
  node.addEventListener('click', onClick);
  return node;
};

/**
 * Bouton pilule des barres flottantes. `content` : texte ou nœuds (icône
 * comprise) ; `className` ajoute une variante (`is-square`, `is-primary`…).
 */
export const pillButton = (content, { title = null, label = null, className = null, onClick = null, type = 'button' } = {}) => {
  const node = el('button', className ? `pill-btn ${className}` : 'pill-btn');
  node.type = type;
  node.append(...[content].flat());
  if (title) node.title = title;
  if (label) node.setAttribute('aria-label', label);
  if (onClick) node.addEventListener('click', onClick);
  return node;
};

export const addButtonFor = (label, focusKey, onClick) => textButton([icon('plus', ICON_SIZE.md), 'Ajouter'], { label, focusKey, onClick });

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
  button.append(icon('chevronDown', ICON_SIZE.md), el('span', 'section-title', title.textContent), summary);
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
