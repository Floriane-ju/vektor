import {
  addModifier,
  clampExtent,
  clampInner,
  clampSides,
  getActiveElement,
  getActiveLayer,
  moveModifier,
  removeModifier,
  setLayerStroke,
  setLayerStrokeWidth,
  SHAPES,
  updateElement,
  updateModifier,
} from '../scene.js';
import { iconButton, rebuildWithFocus } from './list.js';
import { interpolationSection } from './interpolation-section.js';
import { FIXED_COPIES, MODIFIER_LABELS } from '../modifiers.js';

/**
 * Réglages de la forme et du calque actifs, construits une seule fois et
 * ensuite synchronisés. Ils n'ont pas de panneau à eux : les listes les logent
 * dans la card sélectionnée.
 *
 * Les reconstruire à chaque notification arracherait le focus du curseur en
 * cours de glissement : chaque `input` notifie le store, qui redessine — et le
 * slider disparaîtrait sous la souris au premier pixel.
 */

const field = (labelText, control) => {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
};

const option = (value, label) => {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
};

let uid = 0;
const input = (type, attrs = {}) => {
  const node = document.createElement('input');
  node.type = type;
  node.id = `prop-${++uid}`;
  Object.assign(node, attrs);
  return node;
};

export const mountPropertyPanel = ({ store }) => {
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

  /* ---- Forme ---- */

  const shape = document.createElement('fieldset');
  const shapeLegend = document.createElement('legend');
  shapeLegend.textContent = 'Forme';
  shape.append(shapeLegend);

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

  const positionRow = document.createElement('div');
  positionRow.className = 'field-row';
  positionRow.append(field('Position X', posX), field('Position Y', posY));

  const radiusField = field('Rayon', radius);
  const widthField = field('Largeur', width);
  const heightField = field('Hauteur', height);
  /* Une ligne n'a ni largeur ni hauteur : ces deux champs y désignent l'écart
     entre ses extrémités, signe compris. */
  const spanLabels = { signed: ['Écart X', 'Écart Y'], default: ['Largeur', 'Hauteur'] };

  const sizeRow = document.createElement('div');
  sizeRow.className = 'field-row';
  sizeRow.append(radiusField, widthField, heightField);

  /* 100 % : polygone convexe ; en deçà, étoile. */
  const polygonRow = document.createElement('div');
  polygonRow.className = 'field-row';
  polygonRow.append(field('Côtés', sides), field('Rayon intérieur (%)', inner));

  const filledField = field('Remplir', filled);
  const closedField = field('Fermé', closed);
  shape.append(positionRow, sizeRow, polygonRow, closedField, filledField);

  /* ---- Calque ---- */

  /* L'épaisseur et la couleur appartiennent au calque : toutes ses formes
     sortent du même outil, et un point y trouve son diamètre. */
  const layerSet = document.createElement('fieldset');
  const layerLegend = document.createElement('legend');
  layerLegend.textContent = 'Calque';
  layerSet.append(layerLegend);

  const strokeWidth = bind(
    input('number', { min: '0', step: '0.5' }),
    (layer) => layer.strokeWidth,
    (layer, value) => store.apply(setLayerStrokeWidth, layer.id, value),
    { subject: 'layer' },
  );
  const stroke = bind(
    input('color'),
    (layer) => layer.stroke,
    (layer, value) => store.apply(setLayerStroke, layer.id, value),
    { subject: 'layer', parse: String },
  );
  layerSet.append(field('Épaisseur', strokeWidth), field('Couleur', stroke));

  /* ---- Modificateurs ---- */

  /**
   * Un calque porte une pile : chaque bloc est un modificateur, appliqué dans
   * l'ordre affiché, et les copies se multiplient d'un étage à l'autre.
   *
   * Seule section reconstruite du panneau, et seulement quand la longueur de la
   * pile change : reconstruire à chaque notification arracherait le curseur des
   * champs, comme ailleurs dans ce panneau.
   */
  const modifierSet = document.createElement('fieldset');
  const modifierLegend = document.createElement('legend');
  modifierLegend.textContent = 'Modificateurs';
  const modifierHost = document.createElement('div');
  const addModifierButton = document.createElement('button');
  addModifierButton.type = 'button';
  addModifierButton.textContent = '+ Ajouter un modificateur';
  addModifierButton.dataset.focusKey = 'add-modifier';
  addModifierButton.addEventListener('click', () => {
    const layer = getActiveLayer(store.get());
    if (layer) store.apply(addModifier, layer.id);
  });
  modifierSet.append(modifierLegend, modifierHost, addModifierButton);

  let blocks = [];

  const modifierBlock = (index, stackSize) => {
    const blockControls = [];
    /* Tout contrôle du bloc écrit le même modificateur : son rang dans la pile. */
    const bindModifier = (node, read, toPatch, options = {}) =>
      bind(
        node,
        read,
        (layer, value) => store.apply(updateModifier, layer.id, index, toPatch(value)),
        { subject: 'layer', into: blockControls, ...options },
      );

    const rank = index + 1;
    const type = document.createElement('select');
    type.id = `prop-${++uid}`;
    type.setAttribute('aria-label', `Type du modificateur ${rank}`);
    for (const [value, label] of Object.entries(MODIFIER_LABELS)) type.append(option(value, label));
    bindModifier(type, (layer) => layer.modifiers[index].type, (value) => ({ type: value }), {
      event: 'change',
      parse: String,
    });

    const count = bindModifier(
      input('number', { min: '1', step: '1' }),
      (layer) => layer.modifiers[index].n,
      (value) => ({ n: value }),
      { event: 'change' },
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

    const apply = (transition, ...args) => {
      const layer = getActiveLayer(store.get());
      if (layer) store.apply(transition, layer.id, ...args);
    };

    const head = document.createElement('div');
    head.className = 'modifier-head';
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

    const countField = field('Nombre (N)', count);
    const stepRow = document.createElement('div');
    stepRow.className = 'field-row';
    stepRow.append(field('Pas X (px)', stepX), field('Pas Y (px)', stepY));
    const angleField = field('Pas angulaire (rad)', angleStep);
    const radiusStepField = field('Croissance par copie (%)', radiusStep);

    const root = document.createElement('div');
    root.className = 'modifier-block';
    root.append(head, countField, stepRow, angleField, radiusStepField);

    const sync = (layer) => {
      const modifier = layer.modifiers[index];
      if (!modifier) return;
      for (const { node, read } of blockControls) {
        if (document.activeElement !== node) node.value = read(layer);
      }
      /* `none` et les miroirs décident eux-mêmes de leur nombre de copies : leur
         proposer un « Nombre » promettrait un réglage sans effet. */
      countField.hidden = Object.hasOwn(FIXED_COPIES, modifier.type);
      stepRow.hidden = modifier.type !== 'step';
      angleField.hidden = modifier.type !== 'spiral';
      radiusStepField.hidden = modifier.type !== 'spiral';
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

  /* Même calque, même card : la rampe d'une interpolation se lie à un étage de
     la pile voisine. */
  const interpolations = interpolationSection({ store });

  const layerDetail = document.createElement('div');
  layerDetail.className = 'card-detail';
  layerDetail.append(layerSet, modifierSet, interpolations.root);
  const shapeDetail = document.createElement('div');
  shapeDetail.className = 'card-detail';
  shapeDetail.append(shape);

  /* ---- Synchronisation ---- */

  const sync = (scene) => {
    const layer = getActiveLayer(scene);
    const element = getActiveElement(scene);
    const subjects = { layer, element };

    /* Les champs de forme suivent la forme sélectionnée, les modificateurs
       suivent le calque : sans forme sélectionnée on peut encore régler la pile
       du calque. */
    shape.disabled = !element;
    shape.setAttribute('aria-disabled', String(!element));
    for (const set of [layerSet, modifierSet]) {
      set.disabled = !layer;
      set.setAttribute('aria-disabled', String(!layer));
    }

    for (const { node, read, subject } of controls) {
      const target = subjects[subject];
      if (!target) continue;
      const value = read(target);
      if (node.type === 'checkbox') node.checked = Boolean(value);
      else if (node.tagName === 'SPAN') node.textContent = value;
      else if (document.activeElement !== node) node.value = value;
    }

    const uniform = element ? SHAPES[element.type].uniform : true;
    /* Un point n'a ni taille ni remplissage : l'épaisseur du calque lui donne
       son diamètre. */
    const dot = element ? SHAPES[element.type].geometry === 'dot' : false;
    radiusField.hidden = !uniform || dot;
    widthField.hidden = uniform;
    heightField.hidden = uniform;
    filledField.hidden = dot;
    polygonRow.hidden = !element || SHAPES[element.type].geometry !== 'polygon';
    /* Un tracé se dimensionne par ses sommets, pas par des champs. */
    const trace = element ? SHAPES[element.type].geometry === 'polyline' : false;
    sizeRow.hidden = trace;
    closedField.hidden = !trace;
    const [widthLabel, heightLabel] =
      spanLabels[element && SHAPES[element.type].signed ? 'signed' : 'default'];
    widthField.querySelector('label').textContent = widthLabel;
    heightField.querySelector('label').textContent = heightLabel;

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
