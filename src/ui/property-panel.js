import {
  addModifier,
  ARC_CLOSURES,
  clampAngle,
  clampDash,
  clampLinecap,
  clampExtent,
  clampInner,
  clampSides,
  getActiveElement,
  getActiveLayer,
  moveModifier,
  removeModifier,
  DASH_PRESETS,
  LINECAPS,
  parseDash,
  setLayerStroke,
  setLayerStrokeWidth,
  SHAPES,
  updateElement,
  updateModifier,
} from '../scene.js';
import { iconButton, rebuildWithFocus, shapeName, whenChanged } from './list.js';
import { interpolationSection } from './interpolation-section.js';
import { booleanSection } from './boolean-section.js';
import { FIXED_COPIES, MODIFIER_LABELS, ORIENTING, orients } from '../modifiers.js';

/**
 * Panneau de droite : les réglages du calque actif, ou ceux de la forme
 * sélectionnée — jamais les deux. Construits une seule fois et ensuite
 * synchronisés.
 *
 * Les reconstruire à chaque notification arracherait le focus du curseur en
 * cours de glissement : chaque `input` notifie le store, qui redessine — et le
 * slider disparaîtrait sous la souris au premier pixel.
 */

/* Pastilles de couleur proposées d'office ; le sélecteur libre et le champ hex
   restent là pour tout le reste. */
const PALETTE = [
  ['#ee4722', 'Rouge-orangé'],
  ['#fcb911', 'Orange'],
  ['#f5ed62', 'Jaune'],
  ['#3ba2d6', 'Bleu'],
  ['#fcfaf3', 'Crème'],
];

/* Bornes des curseurs. Le champ numérique voisin accepte au-delà : le curseur
   couvre l'usage courant sans plafonner le modèle. */
const STROKE_SLIDER = { min: '0', max: '20', step: '0.5' };
const COUNT_SLIDER = { min: '1', max: '64', step: '1' };
const DASH_SLIDER = { min: '0.5', max: '16', step: '0.5' };

const HEX = /^#?([0-9a-f]{6})$/i;

let uid = 0;
const nextId = () => `prop-${++uid}`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const field = (labelText, control) => {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
};

const row = (...children) => {
  const node = el('div', 'field-row');
  node.append(...children);
  return node;
};

const separator = () => el('hr', 'separator');

const option = (value, label) => {
  const node = el('option', null, label);
  node.value = value;
  return node;
};

const input = (type, attrs = {}) => {
  const node = document.createElement('input');
  node.type = type;
  node.id = nextId();
  Object.assign(node, attrs);
  return node;
};

const select = (entries) => {
  const node = document.createElement('select');
  node.id = nextId();
  for (const [value, label] of entries) node.append(option(value, label));
  return node;
};

/* Case à cocher habillée en interrupteur ; la case reste native. */
const switchField = (labelText, checkbox) => {
  checkbox.classList.add('switch');
  const label = el('label', 'switch-field');
  label.append(el('span', null, labelText), checkbox);
  return label;
};

/* Entête d'une section : titre, et son bouton d'ajout à droite. */
const sectionHead = (title, addButton) => {
  const head = el('div', 'section-head');
  head.append(el('h3', null, title), addButton);
  return head;
};

const addButtonFor = (label, focusKey, onClick) => {
  const node = el('button', 'text-btn', '+ Ajouter');
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  node.dataset.focusKey = focusKey;
  node.addEventListener('click', onClick);
  return node;
};

/* Entête du panneau : ce qu'on règle (« Calque », « Forme ») et son nom. */
const inspectorHead = (kind) => {
  const head = el('div', 'inspector-head');
  const eyebrow = el('div', 'inspector-kind');
  eyebrow.append(el('span', null, kind));
  const title = el('h2', 'inspector-title');
  head.append(eyebrow, title);
  return { head, title };
};

export const mountPropertyPanel = ({ store, container = null }) => {
  const controls = [];

  /**
   * Relie un `input` à une transition de scène.
   *
   * `subject` dit ce que le contrôle édite : la forme active pour les champs de
   * forme, le calque actif pour l'épaisseur et les modificateurs. Le contrôle
   * ne s'écrit pas quand son sujet est absent.
   */
  const bind = (
    node,
    read,
    write,
    { event = 'input', parse = Number, subject = 'element', into = controls } = {},
  ) => {
    node.addEventListener(event, () => {
      const scene = store.get();
      const target = subject === 'element' ? getActiveElement(scene) : getActiveLayer(scene);
      if (target) write(target, parse(node.value));
    });
    into.push({ node, read, subject });
    return node;
  };

  /**
   * Curseur doublé d'un champ numérique : le curseur pour le geste, le champ
   * pour une valeur précise ou hors des bornes du curseur.
   */
  const slider = (labelText, attrs, read, write, options = {}) => {
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

  /**
   * Choix exclusif en segments : des radios natifs, donc flèches et annonce du
   * groupe par le navigateur. `read` rend la valeur cochée, ou rien.
   */
  const segmented = (legendText, entries, read, pick, { subject = 'element' } = {}) => {
    const root = el('fieldset', 'segmented');
    const track = el('div', 'segments');
    root.append(el('legend', null, legendText), track);
    const name = nextId();
    const radios = entries.map(([value, label]) => {
      const radio = input('radio', { name, value });
      radio.addEventListener('change', () => {
        const target = getActiveElement(store.get());
        if (radio.checked && target) pick(target, value);
      });
      const wrap = el('label', 'segment');
      wrap.append(radio, el('span', null, label));
      track.append(wrap);
      return radio;
    });
    controls.push({
      subject,
      sync: (target) => {
        const value = read(target);
        for (const radio of radios) radio.checked = radio.value === value;
      },
    });
    return root;
  };

  /* ---- Forme ---- */

  const shapeHead = inspectorHead('Forme');

  const posX = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.x),
    (element, value) => store.apply(updateElement, element.id, { x: value }),
    { event: 'change' },
  );
  const posY = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.y),
    (element, value) => store.apply(updateElement, element.id, { y: value }),
    { event: 'change' },
  );

  /* Les champs sont en dimensions pleines côté interface — un rayon, une
     largeur — alors que le modèle stocke des demi-extensions depuis le centre.
     La conversion se fait ici, au seul endroit où l'utilisateur lit ces
     nombres. */
  const radius = bind(
    input('number', { min: '0', step: '1' }),
    (element) => Math.round(element.rx),
    (element, value) =>
      store.apply(updateElement, element.id, { rx: Math.max(0, value), ry: Math.max(0, value) }),
  );
  /* Pas de `min` : une ligne a des dimensions signées, et les formes qui n'en
     veulent pas sont ramenées à zéro par `clampExtent`. */
  const width = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.rx * 2),
    (element, value) =>
      store.apply(updateElement, element.id, { rx: clampExtent(element.type, value) / 2 }),
  );
  const height = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.ry * 2),
    (element, value) =>
      store.apply(updateElement, element.id, { ry: clampExtent(element.type, value) / 2 }),
  );
  const sides = bind(
    input('number', { min: '3', step: '1' }),
    (element) => element.sides,
    (element, value) => store.apply(updateElement, element.id, { sides: clampSides(value) }),
    { event: 'change' },
  );
  const inner = bind(
    input('number', { min: '0', max: '100', step: '1' }),
    (element) => element.inner,
    (element, value) => store.apply(updateElement, element.id, { inner: clampInner(value) }),
  );
  const rotation = bind(
    input('number', { step: '1' }),
    (element) => element.rotation ?? 0,
    (element, value) => store.apply(updateElement, element.id, { rotation: value % 360 }),
  );
  const arcStart = bind(
    input('number', { min: '-360', max: '360', step: '1' }),
    (element) => element.start,
    (element, value) => store.apply(updateElement, element.id, { start: clampAngle(value) }),
  );
  const arcEnd = bind(
    input('number', { min: '-360', max: '360', step: '1' }),
    (element) => element.end,
    (element, value) => store.apply(updateElement, element.id, { end: clampAngle(value) }),
  );
  const closure = select(Object.entries(ARC_CLOSURES));
  bind(
    closure,
    (element) => element.closure,
    (element, value) => store.apply(updateElement, element.id, { closure: value }),
    { event: 'change', parse: String },
  );
  /* La couleur est réglée sur le calque : ici on ne dit que rempli ou non, et
     le remplissage reprend cette couleur. */
  const filled = bind(
    input('checkbox'),
    (element) => element.filled,
    (element, value) => store.apply(updateElement, element.id, { filled: value }),
    { event: 'change', parse: () => filled.checked },
  );
  const closed = bind(
    input('checkbox'),
    (element) => element.closed,
    (element, value) => store.apply(updateElement, element.id, { closed: value }),
    { event: 'change', parse: () => closed.checked },
  );

  const booleans = booleanSection({ store });

  const radiusField = field('Rayon', radius);
  const widthField = field('Largeur', width);
  const heightField = field('Hauteur', height);
  /* Une ligne n'a ni largeur ni hauteur : ces deux champs y désignent l'écart
     entre ses extrémités, signe compris. */
  const spanLabels = { signed: ['Écart X', 'Écart Y'], default: ['Largeur', 'Hauteur'] };

  const geometryRow = row(radiusField, widthField, heightField, field('X', posX), field('Y', posY));
  const rotationField = field('Rotation (°)', rotation);
  /* 100 % : polygone convexe ; en deçà, étoile. */
  const polygonRow = row(field('Côtés', sides), field('Rayon intérieur (%)', inner));
  /* 0° en haut, sens horaire ; de 0 à 360 l'arc fait le tour complet. */
  const arcRow = row(field('Début (°)', arcStart), field('Fin (°)', arcEnd), field('Fermeture', closure));
  const closedField = switchField('Fermé', closed);
  const filledField = switchField('Remplir de la couleur du calque', filled);

  /* Trait : le type de motif se lit sur le tableau de tirets — vide, plein ;
     un premier tiret nul, des points ; sinon des tirets. La saisie libre garde
     tous les motifs que les segments ne nomment pas. Valeurs en multiples de
     l'épaisseur du calque. */
  const dashKind = (dash) => (dash.length === 0 ? 'solid' : dash[0] === 0 ? 'dotted' : 'dashed');
  const dashSegments = segmented(
    'Trait',
    Object.entries(DASH_PRESETS).map(([value, { label }]) => [value, label]),
    (element) => dashKind(element.dash),
    (element, value) => {
      const { label, ...patch } = DASH_PRESETS[value];
      store.apply(updateElement, element.id, patch);
    },
  );
  const dashLength = slider(
    'Longueur des tirets — × épaisseur',
    DASH_SLIDER,
    (element) => element.dash[0] ?? 0,
    (element, value) => {
      const [, ...rest] = element.dash;
      store.apply(updateElement, element.id, {
        dash: clampDash([Math.max(0, value), ...(rest.length ? rest : [2])]),
      });
    },
  );
  const dashText = bind(
    input('text', { placeholder: 'ex. 4 2' }),
    (element) => element.dash.join(' '),
    (element, value) => store.apply(updateElement, element.id, { dash: value }),
    { event: 'change', parse: parseDash },
  );
  const dashTextField = field('Motif libre (× épaisseur)', dashText);
  const linecapSegments = segmented(
    'Bout',
    Object.entries(LINECAPS),
    (element) => element.linecap,
    (element, value) => store.apply(updateElement, element.id, { linecap: clampLinecap(value) }),
  );
  const strokeGroup = el('div', 'group');
  strokeGroup.append(dashSegments, dashLength, dashTextField, linecapSegments);

  const shapeDetail = el('div', 'inspector-body');
  shapeDetail.dataset.kind = 'shape';
  shapeDetail.setAttribute('aria-label', 'Réglages de la forme');
  const strokeSeparator = separator();
  shapeDetail.append(
    shapeHead.head,
    separator(),
    geometryRow,
    rotationField,
    polygonRow,
    arcRow,
    closedField,
    strokeSeparator,
    strokeGroup,
    filledField,
    separator(),
    booleans.root,
  );

  /* ---- Calque ---- */

  const layerHead = inspectorHead('Calque');

  /* L'épaisseur et la couleur appartiennent au calque : toutes ses formes
     sortent du même outil, et un point y trouve son diamètre. */
  const setStroke = (value) => {
    const layer = getActiveLayer(store.get());
    if (layer) store.apply(setLayerStroke, layer.id, value);
  };

  /* Palette fixe, puis les couleurs hors palette déjà portées par un calque :
     réaccorder deux calques se fait d'un clic, sans recopier l'hexadécimal. */
  const swatchColors = (scene) => {
    const labels = new Map(PALETTE);
    for (const { stroke: value } of scene.layers) {
      const key = value.toLowerCase();
      if (!labels.has(key)) labels.set(key, key.toUpperCase());
    }
    return [...labels];
  };

  const swatchButton = ([value, label]) => {
    const swatch = el('button', 'swatch');
    swatch.type = 'button';
    swatch.dataset.color = value;
    swatch.dataset.focusKey = `swatch-${value}`;
    swatch.dataset.label = label;
    swatch.style.setProperty('--swatch', value);
    swatch.addEventListener('click', () => setStroke(value));
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
  const stroke = bind(
    input('color'),
    (layer) => layer.stroke,
    (layer, value) => store.apply(setLayerStroke, layer.id, value),
    { subject: 'layer', parse: String },
  );
  stroke.setAttribute('aria-label', 'Autre couleur');
  const custom = el('label', 'swatch is-custom', '+');
  custom.title = 'Autre couleur';
  custom.append(stroke);

  const hex = bind(
    input('text', { spellcheck: false, maxLength: 7 }),
    (layer) => layer.stroke.toUpperCase(),
    (layer, value) => {
      const match = HEX.exec(value.trim());
      if (match) store.apply(setLayerStroke, layer.id, `#${match[1].toLowerCase()}`);
      else hex.value = layer.stroke.toUpperCase();
    },
    { subject: 'layer', event: 'change', parse: String },
  );
  hex.className = 'hex';
  controls.push({
    subject: 'layer',
    sync: (layer) => {
      const scene = store.get();
      rebuildSwatches(scene);
      const current = layer.stroke.toLowerCase();
      for (const swatch of swatchList.children) {
        const users = scene.layers.filter(
          (other) => other.id !== layer.id && other.stroke.toLowerCase() === swatch.dataset.color,
        );
        swatch.setAttribute('aria-pressed', String(swatch.dataset.color === current));
        swatch.toggleAttribute('data-used', users.length > 0);
        const label = users.length
          ? `${swatch.dataset.label} — sur ${users.map((other) => other.name).join(', ')}`
          : swatch.dataset.label;
        swatch.setAttribute('aria-label', label);
        swatch.title = label;
      }
    },
  });

  const swatchRow = el('div', 'swatches');
  swatchRow.append(swatchList, custom);
  const hexRow = el('div', 'hex-row');
  const hexLabel = el('label', null, 'Hex');
  hexLabel.htmlFor = hex.id;
  hexRow.append(hexLabel, hex);
  const colorGroup = el('div', 'field');
  colorGroup.append(el('span', 'field-label', 'Couleur'), swatchRow, hexRow);

  const strokeWidth = slider(
    'Épaisseur',
    STROKE_SLIDER,
    (layer) => layer.strokeWidth,
    (layer, value) => store.apply(setLayerStrokeWidth, layer.id, value),
    { subject: 'layer' },
  );

  /* ---- Modificateurs ---- */

  /**
   * Un calque porte une pile : chaque bloc est un modificateur, appliqué dans
   * l'ordre affiché, et les copies se multiplient d'un étage à l'autre.
   *
   * Seule section reconstruite du panneau, et seulement quand la longueur de la
   * pile change : reconstruire à chaque notification arracherait le curseur des
   * champs, comme ailleurs dans ce panneau.
   */
  const modifierSet = el('section', 'group');
  const modifierHost = el('div', 'stack');
  const addModifierButton = addButtonFor('Ajouter un modificateur', 'add-modifier', () => {
    const layer = getActiveLayer(store.get());
    if (layer) store.apply(addModifier, layer.id);
  });
  modifierSet.append(sectionHead('Répéter', addModifierButton), modifierHost);

  let blocks = [];

  const modifierBlock = (index, stackSize) => {
    const blockControls = [];
    /* Tout contrôle du bloc écrit le même modificateur : son rang dans la pile. */
    const modifierOptions = (options = {}) => ({ subject: 'layer', into: blockControls, ...options });
    const write = (toPatch) => (layer, value) =>
      store.apply(updateModifier, layer.id, index, toPatch(value));
    const bindModifier = (node, read, toPatch, options = {}) =>
      bind(node, read, write(toPatch), modifierOptions(options));

    const rank = index + 1;
    const type = select(Object.entries(MODIFIER_LABELS));
    type.setAttribute('aria-label', `Type du modificateur ${rank}`);
    bindModifier(type, (layer) => layer.modifiers[index].type, (value) => ({ type: value }), {
      event: 'change',
      parse: String,
    });

    const countField = slider(
      'Copies',
      COUNT_SLIDER,
      (layer) => layer.modifiers[index].n,
      write((value) => ({ n: value })),
      modifierOptions(),
    );
    const stepX = bindModifier(
      input('number', { step: '1' }),
      (layer) => layer.modifiers[index].stepX,
      (value) => ({ stepX: value }),
    );
    const stepY = bindModifier(
      input('number', { step: '1' }),
      (layer) => layer.modifiers[index].stepY,
      (value) => ({ stepY: value }),
    );
    const angleStep = bindModifier(
      input('number', { step: '0.05' }),
      (layer) => layer.modifiers[index].angleStep,
      (value) => ({ angleStep: value }),
    );
    const radiusStep = bindModifier(
      input('number', { step: '1' }),
      (layer) => layer.modifiers[index].radiusStep,
      (value) => ({ radiusStep: value }),
    );
    /* Décochée, la copie ne fait que se déplacer : des carrés droits posés en
       cercle sont un motif aussi légitime que des rayons. */
    const orient = bindModifier(
      input('checkbox'),
      (layer) => orients(layer.modifiers[index]),
      (value) => ({ orient: value }),
      { event: 'change', parse: () => orient.checked },
    );

    const apply = (transition, ...args) => {
      const layer = getActiveLayer(store.get());
      if (layer) store.apply(transition, layer.id, ...args);
    };

    const head = el('div', 'modifier-head');
    head.append(
      type,
      /* L'ordre de la pile change le dessin : un pas puis un miroir donne deux
         rangées face à face, l'inverse une seule rangée doublée. */
      iconButton({
        label: `Monter le modificateur ${rank}`,
        text: '↑',
        focusKey: `up-modifier${index}`,
        disabled: index === 0,
        onClick: () => apply(moveModifier, index, -1),
      }),
      iconButton({
        label: `Descendre le modificateur ${rank}`,
        text: '↓',
        focusKey: `down-modifier${index}`,
        disabled: index === stackSize - 1,
        onClick: () => apply(moveModifier, index, 1),
      }),
      iconButton({
        label: `Supprimer le modificateur ${rank}`,
        text: '×',
        focusKey: `delete-modifier${index}`,
        danger: true,
        onClick: () => apply(removeModifier, index),
      }),
    );

    const stepRow = row(field('Pas X (px)', stepX), field('Pas Y (px)', stepY));
    const spiralRow = row(field('Pas angulaire (rad)', angleStep), field('Croissance (%)', radiusStep));
    const orientField = switchField('Orienter les copies', orient);

    const root = el('div', 'modifier-block');
    root.append(head, countField, stepRow, spiralRow, orientField);

    const sync = (layer) => {
      const modifier = layer.modifiers[index];
      if (!modifier) return;
      for (const { node, read } of blockControls) {
        if (node.type === 'checkbox') node.checked = read(layer);
        else if (document.activeElement !== node) node.value = read(layer);
      }
      /* `none` et les miroirs décident eux-mêmes de leur nombre de copies : leur
         proposer un « Copies » promettrait un réglage sans effet. */
      countField.hidden = Object.hasOwn(FIXED_COPIES, modifier.type);
      stepRow.hidden = modifier.type !== 'step';
      spiralRow.hidden = modifier.type !== 'spiral';
      /* Un pas ne tourne rien : rien à orienter. */
      orientField.hidden = !ORIENTING.has(modifier.type);
    };

    return { root, sync };
  };

  const rebuildModifiers = (stack) =>
    rebuildWithFocus(modifierHost, () => {
      blocks = stack.map((_, index) => modifierBlock(index, stack.length));
      modifierHost.append(...blocks.map((block) => block.root));
      return addModifierButton;
    });

  /* ---- Interpolations ---- */

  /* Même calque, même panneau : la rampe d'une interpolation se lie à un étage
     de la pile voisine. */
  const interpolations = interpolationSection({ store });

  /* Un `fieldset` pour tout désactiver d'un coup quand il n'y a plus de calque. */
  const layerDetail = el('fieldset', 'inspector-body');
  layerDetail.dataset.kind = 'layer';
  layerDetail.setAttribute('aria-label', 'Réglages du calque');
  layerDetail.append(
    layerHead.head,
    separator(),
    colorGroup,
    strokeWidth,
    separator(),
    modifierSet,
    separator(),
    interpolations.root,
  );

  container?.append(layerDetail, shapeDetail);

  /* ---- Synchronisation ---- */

  const sync = (scene) => {
    const layer = getActiveLayer(scene);
    const element = getActiveElement(scene);
    const subjects = { layer, element };

    /* Une forme sélectionnée prend tout le panneau ; sinon, son calque. */
    layerDetail.hidden = Boolean(element);
    shapeDetail.hidden = !element;
    layerDetail.disabled = !layer;
    layerDetail.setAttribute('aria-disabled', String(!layer));

    layerHead.title.textContent = layer?.name ?? 'Aucun calque';
    const owner = element && scene.layers.find((candidate) => candidate.elements.includes(element));
    shapeHead.title.textContent = owner ? shapeName(owner, element, SHAPES) : '';

    for (const { node, read, subject, sync: custom } of controls) {
      const target = subjects[subject];
      if (!target) continue;
      if (custom) {
        custom(target);
        continue;
      }
      const value = read(target);
      if (node.type === 'checkbox') node.checked = Boolean(value);
      else if (document.activeElement !== node) node.value = value;
    }

    if (element) {
      const { geometry, uniform, signed } = SHAPES[element.type];
      /* Un point n'a ni taille ni remplissage : l'épaisseur du calque lui donne
         son diamètre, et c'est déjà un bout rond sans longueur à découper. */
      const dot = geometry === 'dot';
      /* Un tracé se dimensionne par ses sommets, pas par des champs. */
      const trace = geometry === 'polyline';
      radiusField.hidden = !uniform || dot || trace;
      widthField.hidden = uniform || trace;
      heightField.hidden = uniform || trace;
      filledField.hidden = dot;
      strokeGroup.hidden = dot;
      strokeSeparator.hidden = dot;
      dashLength.hidden = dashKind(element.dash) !== 'dashed';
      /* Un point tourné reste identique : rien à régler. */
      rotationField.hidden = dot;
      polygonRow.hidden = geometry !== 'polygon';
      arcRow.hidden = geometry !== 'arc';
      closedField.hidden = !trace;
      booleans.sync(owner, element);
      const [widthLabel, heightLabel] = spanLabels[signed ? 'signed' : 'default'];
      widthField.querySelector('label').textContent = widthLabel;
      heightField.querySelector('label').textContent = heightLabel;
    }

    /* Seule la longueur de la pile impose une reconstruction : un changement de
       type ne fait que masquer ou montrer des champs du bloc concerné. */
    const stack = layer?.modifiers ?? [];
    if (stack.length !== blocks.length) rebuildModifiers(stack);
    addModifierButton.disabled = !layer;
    if (layer) for (const block of blocks) block.sync(layer);
    interpolations.sync(layer);
  };

  store.subscribe(sync);
  sync(store.get());
  return { layerDetail, shapeDetail };
};
