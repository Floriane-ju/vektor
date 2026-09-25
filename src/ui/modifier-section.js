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
import { addButtonFor, el, field, input, row, sectionHead, select, slider, switchField } from './fields.js';

/* Bornes du curseur de copies. Le champ numérique voisin accepte au-delà. */
const COUNT_SLIDER = { min: '1', max: '64', step: '1' };

const plural = (total) => `${total} copie${total > 1 ? 's' : ''}`;

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

  /* Relie un `input` à l'étage ou au calque courant ; `read`/`write` reçoivent
     `{ layer, owner }`. */
  const bind = (node, read, write, { event = 'input', parse = Number, into }) => {
    node.addEventListener(event, () => {
      const target = current();
      if (target) write(target, parse(node.value));
    });
    into.push({ node, read });
    return node;
  };

  const root = el('section', 'group');
  const host = el('div', 'stack');
  const addButton = addButtonFor('Ajouter un modificateur', `add-modifier${forElement ? '-element' : ''}`, () => {
    const target = current();
    if (target) store.apply(addModifier, target.owner.id);
  });

  /* Pivot du calque : celui de tout étage qui n'a pas le sien. Se déplace
     aussi à la souris, par la croix ou l'axe des repères. */
  const pivotControls = [];
  const layerPivotInput = (axis) =>
    bind(
      input('number', { step: '1' }),
      ({ layer }) => Math.round(layer.center[axis]),
      ({ layer }, value) => store.apply(setLayerCenter, layer.id, { ...layer.center, [axis]: value }),
      { into: pivotControls },
    );
  const layerPivot = row(field('Pivot X', layerPivotInput('x')), field('Pivot Y', layerPivotInput('y')));
  /* Total de la pile, qui multiplie : au-delà du plafond, le calque ne se rend plus. */
  const copyTotalNode = el('p', 'copy-count');
  copyTotalNode.setAttribute('aria-live', 'polite');
  root.append(sectionHead('Répéter', addButton), copyTotalNode, ...(forElement ? [] : [layerPivot]), host);

  let blocks = [];

  const block = (index, stackSize) => {
    const controls = [];
    const stage = ({ owner }) => owner.modifiers[index];
    const write = (toPatch) => ({ owner }, value) => store.apply(updateModifier, owner.id, index, toPatch(value));
    const bindStage = (node, read, toPatch, options = {}) =>
      bind(node, (target) => read(stage(target)), write(toPatch), { into: controls, ...options });

    const rank = index + 1;
    const type = select(Object.entries(MODIFIER_LABELS));
    type.setAttribute('aria-label', `Type du modificateur ${rank}`);
    bindStage(type, (modifier) => modifier.type, (value) => ({ type: value }), { event: 'change', parse: String });

    const countField = slider(
      bind,
      'Copies',
      COUNT_SLIDER,
      (target) => stage(target).n,
      write((value) => ({ n: value })),
      { into: controls },
    );
    const numberInput = (step, key) =>
      bindStage(input('number', { step }), (modifier) => modifier[key], (value) => ({ [key]: value }));
    const stepX = numberInput('1', 'stepX');
    const stepY = numberInput('1', 'stepY');
    const angleStep = numberInput('0.001', 'angleStep');
    const radiusStep = numberInput('0.1', 'radiusStep');
    /* Angle de l'axe d'un miroir : 90° vertical, 0° horizontal, entre les deux
       les symétries diagonales. */
    const axis = bindStage(input('number', { step: '1' }), axisAngle, (value) => ({ axis: value }));
    /* Décochée, la copie ne fait que se déplacer : des carrés droits posés en
       cercle sont un motif aussi légitime que des rayons. */
    const orient = bindStage(input('checkbox'), orients, (value) => ({ orient: value }), {
      event: 'change',
      parse: () => orient.checked,
    });
    /* Étage d'un point seulement : relie ses copies successives en un tracé. */
    const linear = bindStage(input('checkbox'), (modifier) => modifier.linear === true, (value) => ({ linear: value }), {
      event: 'change',
      parse: () => linear.checked,
    });
    /* Le tracé relié passe en courbe par les copies au lieu de les joindre en ligne brisée. */
    const smooth = bindStage(input('checkbox'), (modifier) => modifier.smooth === true, (value) => ({ smooth: value }), {
      event: 'change',
      parse: () => smooth.checked,
    });

    /* Cochée, l'étage part du pivot du calque et le garde ensuite pour lui ;
       décochée, il le reprend. */
    const writeCenter = (toCenter) => ({ layer, owner }, value) =>
      store.apply(updateModifier, owner.id, index, { center: toCenter(pivotOf(layer, index, owner), value) });
    const ownPivot = bind(input('checkbox'), (target) => Boolean(stage(target).center), writeCenter((pivot, own) => (own ? pivot : null)), {
      into: controls,
      event: 'change',
      parse: () => ownPivot.checked,
    });
    const pivotInput = (key) =>
      bind(
        input('number', { step: '1' }),
        ({ layer, owner }) => Math.round(pivotOf(layer, index, owner)[key]),
        writeCenter((pivot, value) => ({ ...pivot, [key]: value })),
        { into: controls },
      );

    const apply = (transition, ...args) => {
      const target = current();
      if (target) store.apply(transition, target.owner.id, ...args);
    };
    const suffix = forElement ? '-element' : '';

    const head = el('div', 'modifier-head');
    head.append(
      type,
      /* L'ordre de la pile change le dessin : un pas puis un miroir donne deux
         rangées face à face, l'inverse une seule rangée doublée. */
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

    const stepRow = row(field('Pas X (px)', stepX), field('Pas Y (px)', stepY));
    const spiralRow = row(field('Pas angulaire (rad)', angleStep), field('Croissance (%)', radiusStep));
    const axisField = field("Angle de l'axe (°)", axis);
    const orientField = switchField('Orienter les copies', orient);
    const linearField = switchField('Activer les répétitions linéaires', linear);
    const smoothField = switchField('Lisser', smooth);
    const ownPivotField = switchField('Pivot personnalisé', ownPivot);
    const pivotRow = row(field('Pivot X', pivotInput('x')), field('Pivot Y', pivotInput('y')));

    const node = el('div', 'modifier-block');
    node.append(head, countField, stepRow, spiralRow, axisField, orientField, linearField, smoothField, ownPivotField, pivotRow);

    const sync = (target) => {
      const modifier = stage(target);
      if (!modifier) return;
      for (const { node: control, read } of controls) {
        if (control.type === 'checkbox') control.checked = read(target);
        else if (document.activeElement !== control) control.value = read(target);
      }
      /* `none` et les miroirs décident eux-mêmes de leur nombre de copies : leur
         proposer un « Copies » promettrait un réglage sans effet. */
      countField.hidden = Object.hasOwn(FIXED_COPIES, modifier.type);
      stepRow.hidden = modifier.type !== 'step';
      spiralRow.hidden = modifier.type !== 'spiral';
      axisField.hidden = !Object.hasOwn(MIRROR_AXIS, modifier.type);
      /* Un pas ne tourne rien, un point tourné reste identique : rien à orienter. */
      orientField.hidden = !ORIENTING.has(modifier.type) || target.owner.type === 'point';
      /* Seule la pile d'un point relie ses copies ; celle du calque jamais. */
      linearField.hidden = !forElement || target.owner.type !== 'point' || modifier.type === 'none';
      /* Deux copies (miroir) ne font qu'un segment : rien à courber. */
      smoothField.hidden = linearField.hidden || !modifier.linear || effectiveCount(modifier) < 3;
      ownPivotField.hidden = !PIVOTING.has(modifier.type);
      pivotRow.hidden = ownPivotField.hidden || !modifier.center;
    };

    return { root: node, sync };
  };

  const rebuild = (stack) =>
    rebuildWithFocus(host, () => {
      blocks = stack.map((_, index) => block(index, stack.length));
      host.append(...blocks.map((entry) => entry.root));
      return addButton;
    });

  const sync = (scene) => {
    const target = ownerOf(scene);
    const stack = target?.owner.modifiers ?? [];
    if (stack.length !== blocks.length) rebuild(stack);
    addButton.disabled = !target;
    if (!target) return;
    const { layer } = target;
    for (const { node, read } of pivotControls) {
      if (document.activeElement !== node) node.value = read(target);
    }
    layerPivot.hidden = !stack.some((modifier) => PIVOTING.has(modifier.type));
    const own = copyCount(stack);
    const total = copyTotal(layer);
    const over = isSuspended(layer);
    copyTotalNode.hidden = stack.length === 0;
    copyTotalNode.dataset.tone = over ? 'error' : 'info';
    copyTotalNode.textContent = over
      ? `${total.toLocaleString('fr-FR')} copies — rendu suspendu au-delà de ${MAX_COPIES.toLocaleString('fr-FR')}`
      : plural(own);
    for (const entry of blocks) entry.sync(target);
  };

  return { root, sync };
};
