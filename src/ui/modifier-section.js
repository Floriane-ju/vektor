import { addModifier, copyTotal, isSuspended, moveModifier, pivotOf, removeModifier, setLayerCenter, updateModifier } from '../scene.js';
import {
  axisAngle,
  copyCount,
  effectiveCount,
  FIXED_COPIES,
  MAX_COPIES,
  MIRROR_AXIS,
  MODIFIER_LABELS,
  ORIENTING,
  orients,
  PIVOTING,
} from '../modifiers.js';
import { iconButton, rebuildWithFocus } from './list.js';
import {
  addButtonFor,
  bindControl,
  collapsible,
  countLabel,
  el,
  field,
  input,
  row,
  sectionHead,
  select,
  showValue,
  slider,
  switchField,
} from './fields.js';

/* Bornes du curseur de copies. Le champ numérique voisin accepte au-delà. */
const COUNT_SLIDER = { min: '1', max: '256', step: '1' };

const plural = (total) => `${total} copie${total > 1 ? 's' : ''}`;

/* « 40 copies du calque × 60 des formes = 2 400 » : les deux facteurs de `copyTotal`. */
const suspendedBreakdown = (layer, total) => {
  const fr = (n) => n.toLocaleString('fr-FR');
  const own = layer.elements.reduce((sum, element) => sum + copyCount(element.modifiers), 0);
  /* Calque vide : `copyTotal` compte une forme sans pile, le calque seul fait le total. */
  if (own === 0) return `${fr(total)} copies du calque`;
  return `${fr(copyCount(layer.modifiers))} copies du calque × ${fr(own)} des formes = ${fr(total)}`;
};

/* Case « Orienter », « Lisser »… d'un étage : `key` lu et écrit tel quel. */
const stageFlags = (bindStage) => {
  const flag = (read, key) => bindStage(input('checkbox'), read, (value) => ({ [key]: value }), { event: 'change' });
  /* Décochée, la copie ne fait que se déplacer : des carrés droits posés en
     cercle sont un motif aussi légitime que des rayons. */
  const orientField = switchField('Orienter les copies', flag(orients, 'orient'));
  /* Étage d'un point seulement : relie ses copies successives en un tracé. */
  const linearField = switchField('Activer les répétitions linéaires', flag((modifier) => modifier.linear === true, 'linear'));
  /* Le tracé relié passe en courbe par les copies au lieu de les joindre en ligne brisée. */
  const smoothField = switchField('Lisser', flag((modifier) => modifier.smooth === true, 'smooth'));
  /* Spirale : copies à égale distance le long de la courbe, au lieu d'un écart qui grandit avec le rayon. */
  const evenField = switchField('Espacement constant', flag((modifier) => modifier.evenSpacing === true, 'evenSpacing'));
  return { orientField, linearField, smoothField, evenField };
};

/* Réglages chiffrés d'un étage : pas, spirale, axe de miroir. */
const stageNumbers = (bindStage) => {
  const numberInput = (step, key) =>
    bindStage(input('number', { step }), (modifier) => modifier[key], (value) => ({ [key]: value }));
  const stepRow = row(field('Pas X (px)', numberInput('1', 'stepX')), field('Pas Y (px)', numberInput('1', 'stepY')));
  const spiralRow = row(
    field('Pas angulaire (rad)', numberInput('0.001', 'angleStep')),
    field('Croissance (%)', numberInput('0.1', 'radiusStep')),
  );
  /* Angle de l'axe d'un miroir : 90° vertical, 0° horizontal, entre les deux
     les symétries diagonales. */
  const axisField = field(
    "Angle de l'axe (°)",
    bindStage(input('number', { step: '1' }), axisAngle, (value) => ({ axis: value })),
  );
  return { stepRow, spiralRow, axisField };
};

/* Entête d'un étage : son type, et les boutons monter, descendre, supprimer.
   L'ordre de la pile change le dessin : un pas puis un miroir donne deux
   rangées face à face, l'inverse une seule rangée doublée. */
const stageHead = (type, { index, stackSize, suffix, apply }) => {
  const rank = index + 1;
  const head = el('div', 'modifier-head');
  head.append(
    type,
    iconButton({
      label: `Monter le modificateur ${rank}`,
      text: '↑',
      focusKey: `up-modifier${suffix}${index}`,
      disabled: index === 0,
      onClick: () => apply(moveModifier, index, -1),
    }),
    iconButton({
      label: `Descendre le modificateur ${rank}`,
      text: '↓',
      focusKey: `down-modifier${suffix}${index}`,
      disabled: index === stackSize - 1,
      onClick: () => apply(moveModifier, index, 1),
    }),
    iconButton({
      label: `Supprimer le modificateur ${rank}`,
      text: '×',
      focusKey: `delete-modifier${suffix}${index}`,
      danger: true,
      onClick: () => apply(removeModifier, index),
    }),
  );
  return head;
};

/* Pivot propre d'un étage. Cochée, l'étage part du pivot du calque et le garde
   ensuite pour lui ; décochée, il le reprend. */
const stagePivot = (store, bind, index) => {
  const writeCenter = (toCenter) => ({ layer, owner }, value) =>
    store.apply(updateModifier, owner.id, index, { center: toCenter(pivotOf(layer, index, owner), value) });
  const ownPivot = bind(input('checkbox'), ({ owner }) => Boolean(owner.modifiers[index].center), writeCenter((pivot, own) => (own ? pivot : null)), {
    event: 'change',
  });
  const pivotInput = (key) =>
    bind(
      input('number', { step: '1' }),
      ({ layer, owner }) => Math.round(pivotOf(layer, index, owner)[key]),
      writeCenter((pivot, value) => ({ ...pivot, [key]: value })),
    );
  const ownPivotField = switchField('Pivot personnalisé', ownPivot);
  const pivotRow = row(field('Pivot X', pivotInput('x')), field('Pivot Y', pivotInput('y')));
  return { ownPivotField, pivotRow };
};

/* Ce qu'un étage montre selon son type et son propriétaire. */
const showStage = (parts, modifier, owner, forElement) => {
  /* `none` et les miroirs décident eux-mêmes de leur nombre de copies : leur
     proposer un « Copies » promettrait un réglage sans effet. */
  parts.countField.hidden = Object.hasOwn(FIXED_COPIES, modifier.type);
  parts.stepRow.hidden = modifier.type !== 'step';
  parts.spiralRow.hidden = modifier.type !== 'spiral' && modifier.type !== 'archimedes';
  parts.evenField.hidden = parts.spiralRow.hidden;
  parts.axisField.hidden = !Object.hasOwn(MIRROR_AXIS, modifier.type);
  /* Un pas ne tourne rien, un point tourné reste identique : rien à orienter. */
  parts.orientField.hidden = !ORIENTING.has(modifier.type) || owner.type === 'point';
  /* Seule la pile d'un point relie ses copies ; celle du calque jamais. */
  parts.linearField.hidden = !forElement || owner.type !== 'point' || modifier.type === 'none';
  /* Deux copies (miroir) ne font qu'un segment : rien à courber. */
  parts.smoothField.hidden = parts.linearField.hidden || !modifier.linear || effectiveCount(modifier) < 3;
  parts.ownPivotField.hidden = !PIVOTING.has(modifier.type);
  parts.pivotRow.hidden = parts.ownPivotField.hidden || !modifier.center;
};

/* Bloc d'un étage de la pile. `current()` rend `{ layer, owner }` ou `null`. */
const stageBlock = ({ store, current, forElement }, index, stackSize) => {
  const controls = [];
  const bind = (node, read, write, options) => {
    controls.push({ node, read });
    return bindControl(node, current, write, options);
  };
  const stage = ({ owner }) => owner.modifiers[index];
  const write = (toPatch) => ({ owner }, value) => store.apply(updateModifier, owner.id, index, toPatch(value));
  const bindStage = (node, read, toPatch, options) => bind(node, (target) => read(stage(target)), write(toPatch), options);
  const apply = (transition, ...args) => {
    const target = current();
    if (target) store.apply(transition, target.owner.id, ...args);
  };

  const type = select(Object.entries(MODIFIER_LABELS));
  type.setAttribute('aria-label', `Type du modificateur ${index + 1}`);
  bindStage(type, (modifier) => modifier.type, (value) => ({ type: value }), { event: 'change', parse: String });
  const countField = slider(bind, 'Copies', COUNT_SLIDER, (target) => stage(target).n, write((value) => ({ n: value })));
  const parts = { countField, ...stageNumbers(bindStage), ...stageFlags(bindStage), ...stagePivot(store, bind, index) };

  const node = el('div', 'modifier-block');
  node.append(
    stageHead(type, { index, stackSize, suffix: forElement ? '-element' : '', apply }),
    countField,
    parts.stepRow,
    parts.spiralRow,
    parts.evenField,
    parts.axisField,
    parts.orientField,
    parts.linearField,
    parts.smoothField,
    parts.ownPivotField,
    parts.pivotRow,
  );

  const sync = (target) => {
    const modifier = stage(target);
    if (!modifier) return;
    for (const { node: control, read } of controls) showValue(control, read(target));
    showStage(parts, modifier, target.owner, forElement);
  };
  return { root: node, sync };
};

/**
 * Section « Répéter » : la pile de modificateurs d'un calque ou d'une forme,
 * chaque bloc un étage appliqué dans l'ordre affiché. La pile d'une forme
 * s'applique avant celle de son calque, et leurs copies se multiplient.
 *
 * `ownerOf(scene)` rend `{ layer, owner }` — `owner` = le calque lui-même ou
 * l'une de ses formes — ou `null`. `forElement` : section du panneau forme,
 * sans le pivot du calque, avec la case linéaire sur les étages d'un point.
 *
 * Seule la longueur de la pile impose une reconstruction : reconstruire à
 * chaque notification arracherait le curseur des champs.
 */
export const modifierSection = ({ store, ownerOf, forElement = false }) => {
  const current = () => ownerOf(store.get());

  const root = el('section', 'group');
  const host = el('div', 'stack');
  const addButton = addButtonFor('Ajouter un modificateur', `add-modifier${forElement ? '-element' : ''}`, () => {
    const target = current();
    if (target) store.apply(addModifier, target.owner.id);
  });

  /* Pivot du calque : celui de tout étage qui n'a pas le sien. Se déplace
     aussi à la souris, par la croix ou l'axe des repères. */
  const pivotControls = [];
  const layerPivotInput = (axis) => {
    const node = input('number', { step: '1' });
    pivotControls.push({ node, read: ({ layer }) => Math.round(layer.center[axis]) });
    return bindControl(node, current, ({ layer }, value) =>
      store.apply(setLayerCenter, layer.id, { ...layer.center, [axis]: value }),
    );
  };
  const layerPivot = row(field('Pivot X', layerPivotInput('x')), field('Pivot Y', layerPivotInput('y')));
  /* Total de la pile, qui multiplie : au-delà du plafond, le calque ne se rend plus. */
  const copyTotalNode = el('p', 'copy-count');
  copyTotalNode.setAttribute('aria-live', 'polite');
  const head = sectionHead('Répéter', addButton);
  root.append(head, copyTotalNode, ...(forElement ? [] : [layerPivot]), host);
  const fold = collapsible(root, head, 'repeat');

  let blocks = [];

  const rebuild = (stack) =>
    rebuildWithFocus(host, () => {
      blocks = stack.map((_, index) => stageBlock({ store, current, forElement }, index, stack.length));
      host.append(...blocks.map((entry) => entry.root));
      return addButton;
    });

  /* Total des copies, et son plafond. Suspendu : d'où vient le total, pour savoir quel étage réduire. */
  const showTotal = (stack, layer) => {
    const own = copyCount(stack);
    const total = copyTotal(layer);
    const over = isSuspended(layer);
    copyTotalNode.hidden = stack.length === 0;
    copyTotalNode.dataset.tone = over ? 'error' : 'info';
    copyTotalNode.textContent = over
      ? `${suspendedBreakdown(layer, total)} — rendu suspendu au-delà de ${MAX_COPIES.toLocaleString('fr-FR')}`
      : plural(own);
    fold.summarize(stack.length ? `${countLabel(stack.length, 'étage')} · ${plural(own)}` : countLabel(0, 'étage'));
  };

  const sync = (scene) => {
    const target = ownerOf(scene);
    const stack = target?.owner.modifiers ?? [];
    if (stack.length !== blocks.length) rebuild(stack);
    addButton.disabled = !target;
    if (!target) return;
    for (const { node, read } of pivotControls) showValue(node, read(target));
    layerPivot.hidden = !stack.some((modifier) => PIVOTING.has(modifier.type));
    showTotal(stack, target.layer);
    for (const entry of blocks) entry.sync(target);
  };

  return { root, sync };
};
