import { currentStyle, getActiveElement, setStyle } from '../scene.js';
import { rebuildWithFocus, whenChanged } from './list.js';

/**
 * Carte du trait, en haut à droite : couleur et épaisseur de la forme active,
 * ou sans sélection celles des prochaines formes (`currentStyle`), toujours
 * sous la main comme dans Illustrator. La pastille ouvre la palette
 * globale, un sélecteur natif et le champ hexadécimal.
 *
 * ponytail: `popover` natif, comme le menu et les paramètres — Échap et clic
 * extérieur le ferment d'eux-mêmes.
 */

/* Pastilles de base (l'accent et le blanc du thème) ; les couleurs du dessin
   s'y ajoutent, cf. `swatchColors`. */
const PALETTE = [
  ['#ee4722', 'Accent'],
  ['#fcfaf3', 'Blanc'],
];

const HEX = /^#?([0-9a-f]{6})$/i;
/* Écart entre la carte et la palette qu'elle ouvre. */
const POPOVER_GAP = 8;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/* Palette fixe, puis les couleurs hors palette déjà portées par une forme :
   réaccorder deux formes se fait d'un clic, sans recopier l'hexadécimal. */
const swatchColors = (scene) => {
  const labels = new Map(PALETTE);
  for (const { stroke } of scene.layers.flatMap((layer) => layer.elements)) {
    const key = stroke.toLowerCase();
    if (!labels.has(key)) labels.set(key, key.toUpperCase());
  }
  return [...labels];
};

export const mountStrokeCard = ({ store, container = null }) => {
  const setStroke = (patch) => store.apply(setStyle, patch);

  const palette = el('div', 'stroke-palette');
  palette.id = 'stroke-palette';
  palette.popover = 'auto';
  palette.setAttribute('aria-label', 'Couleur du trait');

  const trigger = el('button', 'pill-btn is-square stroke-current');
  trigger.type = 'button';
  trigger.title = 'Couleur du trait';
  trigger.setAttribute('aria-label', 'Couleur du trait');
  trigger.setAttribute('popovertarget', palette.id);

  /* Sous la pastille : la carte glisse avec la largeur de la barre voisine,
     une position fixe en CSS tomberait à côté. */
  palette.addEventListener('beforetoggle', (event) => {
    if (event.newState !== 'open') return;
    const box = trigger.getBoundingClientRect();
    palette.style.top = `${box.bottom + POPOVER_GAP}px`;
    palette.style.left = `${box.left}px`;
  });

  const swatchButton = ([value, label]) => {
    const swatch = el('button', 'swatch');
    swatch.type = 'button';
    swatch.dataset.color = value;
    swatch.dataset.focusKey = `swatch-${value}`;
    swatch.dataset.label = label;
    swatch.style.setProperty('--swatch', value);
    swatch.addEventListener('click', () => setStroke({ stroke: value }));
    return swatch;
  };

  const swatchList = el('div', 'swatch-list');
  const rebuildSwatches = whenChanged(
    (scene) => JSON.stringify(swatchColors(scene)),
    (scene) =>
      rebuildWithFocus(swatchList, () => {
        swatchList.append(...swatchColors(scene).map(swatchButton));
        return null;
      }),
  );

  const picker = el('input');
  picker.type = 'color';
  picker.setAttribute('aria-label', 'Autre couleur');
  picker.addEventListener('input', () => setStroke({ stroke: picker.value }));
  const custom = el('label', 'swatch is-custom', '+');
  custom.title = 'Autre couleur';
  custom.append(picker);

  const hex = el('input', 'hex');
  hex.type = 'text';
  hex.id = 'stroke-hex';
  hex.spellcheck = false;
  hex.maxLength = 7;
  const hexLabel = el('label', null, 'Hex');
  hexLabel.htmlFor = hex.id;
  const hexRow = el('div', 'hex-row');
  hexRow.append(hexLabel, hex);

  const swatchRow = el('div', 'swatches');
  swatchRow.append(swatchList, custom);
  palette.append(el('h2', null, 'Couleur'), swatchRow, hexRow);

  /* Champ numérique : flèches natives, glisser horizontal via `ui/scrub.js`. */
  const width = el('input', 'stroke-width');
  width.type = 'number';
  width.id = 'stroke-width';
  width.min = '0';
  width.step = '0.5';
  width.title = 'Épaisseur du trait';
  width.setAttribute('aria-label', 'Épaisseur du trait');
  width.addEventListener('change', () => setStroke({ strokeWidth: Math.max(0, Number(width.value) || 0) }));
  const widthField = el('label', 'stroke-width-field');
  widthField.append(el('span', 'stroke-line'), width);

  container?.append(trigger, widthField, palette);

  const sync = (scene) => {
    const element = getActiveElement(scene);
    const style = currentStyle(scene);
    const current = style.stroke.toLowerCase();
    trigger.style.setProperty('--swatch', current);
    if (document.activeElement !== width) width.value = String(style.strokeWidth);
    if (document.activeElement !== hex) hex.value = current.toUpperCase();
    picker.value = current;

    rebuildSwatches(scene);
    for (const swatch of swatchList.children) {
      /* Calques où une autre forme porte déjà cette couleur. */
      const users = scene.layers.filter((layer) =>
        layer.elements.some((other) => other.id !== element?.id && other.stroke.toLowerCase() === swatch.dataset.color),
      );
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color === current));
      swatch.toggleAttribute('data-used', users.length > 0);
      const label = users.length
        ? `${swatch.dataset.label} — sur ${users.map((layer) => layer.name).join(', ')}`
        : swatch.dataset.label;
      swatch.setAttribute('aria-label', label);
      swatch.title = label;
    }
  };

  hex.addEventListener('change', () => {
    const match = HEX.exec(hex.value.trim());
    if (match) setStroke({ stroke: `#${match[1].toLowerCase()}` });
    else hex.value = currentStyle(store.get()).stroke.toUpperCase();
  });

  store.subscribe(sync);
  sync(store.get());
};
