import {
  addModifier,
  clampExtent,
  getActiveElement,
  getActiveLayer,
  moveModifier,
  RANGE_BOUNDS,
  removeModifier,
  resetRanges,
  setLayerStroke,
  setLayerStrokeWidth,
  setRangeBinding,
  SHAPES,
  updateElement,
  updateModifier,
  updateRange,
} from '../scene.js';
import { iconButton, rebuildWithFocus } from './list.js';
import { FIXED_COPIES, MODIFIER_LABELS } from '../modifiers.js';

/**
 * Contrairement au panneau calques, ce panneau est construit une seule fois et
 * ensuite synchronisé.
 *
 * Le reconstruire à chaque notification arracherait le focus du curseur en
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

export const mountPropertyPanel = ({ store, container, status }) => {
  const controls = [];

  /**
   * Relie un `input` à une transition de scène.
   *
   * `subject` dit ce que le contrôle édite : la forme active pour les champs de
   * forme, le calque actif pour l'épaisseur, le modificateur et
   * l'interpolation. Le contrôle ne s'écrit pas quand son sujet est absent.
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

  const shapeName = document.createElement('p');
  shapeName.className = 'shape-name';
  controls.push({
    node: shapeName,
    subject: 'element',
    read: (element) => SHAPES[element.type].label,
  });

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
  /* La couleur est réglée sur le calque : ici on ne dit que rempli ou non, et
     le remplissage reprend cette couleur. */
  const filled = bind(
    input('checkbox'),
    (element) => element.filled,
    (element, value) => store.apply(updateElement, element.id, { filled: value }),
    { event: 'change', parse: () => filled.checked },
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

  const filledField = field('Remplir', filled);
  shape.append(shapeName, positionRow, sizeRow, filledField);

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
      if (blocks.length === 0) {
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = 'Aucun : le calque se rend tel quel.';
        modifierHost.append(note);
      }
      modifierHost.append(...blocks.map((block) => block.root));
      return addModifierButton;
    });

  /* ---- Interpolation ---- */

  const interpolationSet = document.createElement('fieldset');
  const interpolationLegend = document.createElement('legend');
  interpolationLegend.textContent = 'Interpolation';
  interpolationSet.append(interpolationLegend);

  const rangeControl = (property, index, labelText) => {
    const { min, max, step } = RANGE_BOUNDS[property];
    const slider = bind(
      input('range', { min: String(min), max: String(max), step: String(step) }),
      (layer) => layer.propertyRanges[property][index],
      (layer, value) => store.apply(updateRange, layer.id, property, index, value),
      { subject: 'layer' },
    );
    const readout = document.createElement('span');
    readout.className = 'range-value';
    controls.push({
      node: readout,
      subject: 'layer',
      read: (layer) => layer.propertyRanges[property][index].toFixed(2),
    });

    const wrap = field(labelText, slider);
    wrap.querySelector('label').append(' ', readout);
    return wrap;
  };

  /**
   * Rampe suivie par une propriété : toutes les copies de la pile, ou l'indice
   * d'un seul de ses étages.
   *
   * Un par propriété, et non un pour la section : lier l'opacité au miroir
   * pendant que l'échelle court sur le total est précisément ce qu'on veut
   * pouvoir dessiner.
   */
  const bindingSelects = [];
  const bindingControl = (property, labelText) => {
    const select = document.createElement('select');
    select.id = `prop-${++uid}`;
    select.dataset.binding = property;
    bind(
      select,
      (layer) => String(layer.rangeBindings[property] ?? ''),
      (layer, value) =>
        store.apply(setRangeBinding, layer.id, property, value === '' ? null : Number(value)),
      { subject: 'layer', event: 'change', parse: String },
    );
    bindingSelects.push(select);
    return field(labelText, select);
  };

  /* Les options nomment les étages : elles suivent donc le contenu de la pile,
     pas seulement sa longueur — un changement de type change l'étiquette. */
  let bindingSignature = null;
  const syncBindingOptions = (stack) => {
    const signature = stack.map((modifier) => modifier.type).join('|');
    if (signature === bindingSignature) return;
    bindingSignature = signature;
    for (const select of bindingSelects) {
      const current = select.value;
      select.replaceChildren(
        option('', 'Toutes les copies'),
        ...stack.map((modifier, index) =>
          option(String(index), `${index + 1}. ${MODIFIER_LABELS[modifier.type]}`),
        ),
      );
      select.value = current;
    }
  };

  const opacityRow = document.createElement('div');
  opacityRow.className = 'field-row';
  opacityRow.append(
    rangeControl('opacity', 0, 'Opacité début'),
    rangeControl('opacity', 1, 'Opacité fin'),
  );

  const scaleRow = document.createElement('div');
  scaleRow.className = 'field-row';
  scaleRow.append(
    rangeControl('scale', 0, 'Échelle début'),
    rangeControl('scale', 1, 'Échelle fin'),
  );

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Réinitialiser';
  resetButton.dataset.focusKey = 'reset-interpolation';
  resetButton.addEventListener('click', () => {
    const layer = getActiveLayer(store.get());
    if (layer) store.apply(resetRanges, layer.id);
  });

  interpolationSet.append(
    opacityRow,
    bindingControl('opacity', 'Opacité liée à'),
    scaleRow,
    bindingControl('scale', 'Échelle liée à'),
    resetButton,
  );

  container.append(shape, layerSet, modifierSet, interpolationSet);

  /* ---- Synchronisation ---- */

  const sync = (scene) => {
    const layer = getActiveLayer(scene);
    const element = getActiveElement(scene);
    const subjects = { layer, element };

    /* Les champs de forme suivent la forme sélectionnée, le modificateur et
       l'interpolation suivent le calque : sans forme sélectionnée on peut
       encore régler le modificateur du calque. */
    shape.disabled = !element;
    shape.setAttribute('aria-disabled', String(!element));
    for (const set of [layerSet, modifierSet, interpolationSet]) {
      set.disabled = !layer;
      set.setAttribute('aria-disabled', String(!layer));
    }

    /* Avant la boucle : un `select` ne peut prendre la valeur d'une option qui
       n'existe pas encore. */
    syncBindingOptions(layer?.modifiers ?? []);

    for (const { node, read, subject } of controls) {
      const target = subjects[subject];
      if (!target) continue;
      const value = read(target);
      if (node.type === 'checkbox') node.checked = Boolean(value);
      else if (node.tagName === 'SPAN' || node.tagName === 'P') node.textContent = value;
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
  };

  store.subscribe(sync);
  sync(store.get());
};
