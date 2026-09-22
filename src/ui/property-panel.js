import {
  clampExtent,
  DEFAULT_SHAPE,
  getActiveElement,
  getActiveLayer,
  RANGE_BOUNDS,
  setLayerStrokeWidth,
  SHAPES,
  updateElement,
  updateModifier,
  updateRange,
} from '../scene.js';
import { mountShapeList } from './shape-list.js';
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

let uid = 0;
const input = (type, attrs = {}) => {
  const node = document.createElement('input');
  node.type = type;
  node.id = `prop-${++uid}`;
  Object.assign(node, attrs);
  return node;
};

export const mountPropertyPanel = ({
  store,
  container,
  status,
  getTool = () => DEFAULT_SHAPE,
}) => {
  const controls = [];

  /**
   * Relie un `input` à une transition de scène.
   *
   * `subject` dit ce que le contrôle édite : la forme active pour les champs de
   * forme, le calque actif pour l'épaisseur, le modificateur et
   * l'interpolation. Le contrôle ne s'écrit pas quand son sujet est absent.
   */
  const bind = (node, read, write, { event = 'input', parse = Number, subject = 'element' } = {}) => {
    node.addEventListener(event, () => {
      const scene = store.get();
      const target = subject === 'element' ? getActiveElement(scene) : getActiveLayer(scene);
      if (target) write(target, parse(node.value));
    });
    controls.push({ node, read, subject });
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
  const stroke = bind(
    input('color'),
    (element) => (element.stroke === 'none' ? '#000000' : element.stroke),
    (element, value) => store.apply(updateElement, element.id, { stroke: value }),
    { parse: String },
  );
  const fill = bind(
    input('color'),
    (element) => (element.fill === 'none' ? '#000000' : element.fill),
    (element, value) => store.apply(updateElement, element.id, { fill: value }),
    { parse: String },
  );
  const filled = bind(
    input('checkbox'),
    (element) => element.fill !== 'none',
    (element, value) => store.apply(updateElement, element.id, { fill: value ? fill.value : 'none' }),
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
  const fillField = field('Remplissage', fill);
  shape.append(shapeName, positionRow, sizeRow, field('Contour', stroke), filledField, fillField);

  /* ---- Calque ---- */

  /* L'épaisseur appartient au calque : toutes ses formes sortent du même
     outil, et un point y trouve son diamètre. */
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
  layerSet.append(field('Épaisseur', strokeWidth));

  /* ---- Modificateur ---- */

  const modifierSet = document.createElement('fieldset');
  const modifierLegend = document.createElement('legend');
  modifierLegend.textContent = 'Modificateur';
  modifierSet.append(modifierLegend);

  const type = document.createElement('select');
  type.id = `prop-${++uid}`;
  for (const [value, label] of Object.entries(MODIFIER_LABELS)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    type.append(option);
  }
  bind(
    type,
    (layer) => layer.modifier.type,
    (layer, value) => store.apply(updateModifier, layer.id, { type: value }),
    { event: 'change', parse: String, subject: 'layer' },
  );

  const count = bind(
    input('number', { min: '1', step: '1' }),
    (layer) => layer.modifier.n,
    (layer, value) => store.apply(updateModifier, layer.id, { n: value }),
    { event: 'change', subject: 'layer' },
  );
  const stepX = bind(
    input('number', { step: '1' }),
    (layer) => layer.modifier.stepX,
    (layer, value) => store.apply(updateModifier, layer.id, { stepX: value }),
    { subject: 'layer' },
  );
  const stepY = bind(
    input('number', { step: '1' }),
    (layer) => layer.modifier.stepY,
    (layer, value) => store.apply(updateModifier, layer.id, { stepY: value }),
    { subject: 'layer' },
  );
  const angleStep = bind(
    input('number', { step: '0.05' }),
    (layer) => layer.modifier.angleStep,
    (layer, value) => store.apply(updateModifier, layer.id, { angleStep: value }),
    { subject: 'layer' },
  );
  const radiusStep = bind(
    input('number', { step: '1' }),
    (layer) => layer.modifier.radiusStep,
    (layer, value) => store.apply(updateModifier, layer.id, { radiusStep: value }),
    { subject: 'layer' },
  );

  const countField = field('Nombre (N)', count);
  const stepRow = document.createElement('div');
  stepRow.className = 'field-row';
  stepRow.append(field('Pas X (px)', stepX), field('Pas Y (px)', stepY));
  const angleField = field('Pas angulaire (rad)', angleStep);
  const radiusStepField = field('Pas radial (px)', radiusStep);
  modifierSet.append(field('Type', type), countField, stepRow, angleField, radiusStepField);

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

  interpolationSet.append(opacityRow, scaleRow);

  const shapeListSet = document.createElement('fieldset');
  const shapeListLegend = document.createElement('legend');
  shapeListLegend.textContent = 'Formes du calque';
  shapeListSet.append(shapeListLegend);
  const shapeListHost = document.createElement('div');
  shapeListSet.append(shapeListHost);
  mountShapeList({ store, container: shapeListHost, getTool, status });

  container.append(shapeListSet, shape, layerSet, modifierSet, interpolationSet);

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
    fillField.hidden = dot;
    const [widthLabel, heightLabel] =
      spanLabels[element && SHAPES[element.type].signed ? 'signed' : 'default'];
    widthField.querySelector('label').textContent = widthLabel;
    heightField.querySelector('label').textContent = heightLabel;

    if (!layer) return;
    const { type: modifierType } = layer.modifier;
    const isSpiral = modifierType === 'spiral';
    /* `none` et les miroirs décident eux-mêmes de leur nombre de copies : leur
       proposer un « Nombre » promettrait un réglage sans effet. */
    countField.hidden = Object.hasOwn(FIXED_COPIES, modifierType);
    stepRow.hidden = modifierType !== 'step';
    angleField.hidden = !isSpiral;
    radiusStepField.hidden = !isSpiral;
  };

  store.subscribe(sync);
  sync(store.get());
};
