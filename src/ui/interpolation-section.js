import {
  addInterpolation,
  clearInterpolations,
  RANGE_BOUNDS,
  RANGE_LABELS,
  removeInterpolation,
  updateInterpolation,
  updateInterpolationRange,
} from '../scene.js';
import { MODIFIER_LABELS } from '../modifiers.js';
import { CURVE_LABELS, randomSeed } from '../interpolate.js';
import { iconButton, presence, rebuildWithFocus } from './list.js';
import { collapsible, countLabel, el, field, input, row, sectionHead, select, textButton } from './fields.js';

/* Les bornes se saisissent en pourcentage : 1 = 100 %. */
const PERCENT = 100;

/**
 * Section « Faire varier les itérations » du calque ou de la forme : un bloc par interpolation,
 * ajoutée, réglée et supprimée comme un modificateur.
 *
 * Elle vit à côté de la pile de modificateurs parce qu'elle appartient au même
 * calque et parle de la même chose : la rampe d'une interpolation se lie à un
 * étage de la pile voisine, et les deux se lisent d'un seul coup d'œil.
 *
 * Deux interpolations d'une même propriété se composent par produit : l'ordre
 * de la pile ne change rien, d'où l'absence de boutons monter/descendre —
 * contrairement aux modificateurs, dont l'ordre change le dessin.
 *
 * Reconstruite seulement quand la structure de la pile change, jamais sur une
 * valeur de curseur : sans cela le slider disparaîtrait sous la souris au
 * premier pixel de glissement.
 *
 * Les blocs reçoivent `ctx` : `apply(transition, ...args)` sur le propriétaire,
 * `key` (suffixe des clés de focus), `track(sync)` pour les contrôles
 * rafraîchis sans reconstruction, `sync(interpolation)`.
 */

/* Menu déroulant nommé, câblé à `onChange(value)`. */
const choice = (label, entries, value, onChange) => {
  const node = select(entries);
  node.setAttribute('aria-label', label);
  node.value = value;
  node.addEventListener('change', () => onChange(node.value));
  return node;
};

/* Relit l'interpolation `id` du propriétaire à chaque synchronisation. */
const trackOf = (ctx, id, sync) =>
  ctx.track((owner) => {
    const current = owner.interpolations.find((candidate) => candidate.id === id);
    if (current) sync(current);
  });

/* Borne d'une interpolation de couleur : le sélecteur natif, qui ne lit et
   n'écrit que `#rrggbb`, le format du modèle. */
const colorControl = (ctx, interpolation, index, labelText) => {
  const node = input('color');
  node.addEventListener('input', () => ctx.apply(updateInterpolationRange, interpolation.id, index, node.value));
  trackOf(ctx, interpolation.id, (current) => {
    if (document.activeElement !== node) node.value = current.range[index];
  });
  return field(labelText, node);
};

/**
 * Une borne de la plage, en pourcentage. Le champ prend les bornes de la
 * propriété : passer une interpolation d'opacité à l'échelle reconstruit le
 * bloc, donc le `min` et le `max` suivent sans réglage à la main.
 */
const boundControl = (ctx, interpolation, index, labelText) => {
  if (RANGE_BOUNDS[interpolation.property].color) return colorControl(ctx, interpolation, index, labelText);
  const { min, max, step, unit = '%' } = RANGE_BOUNDS[interpolation.property];
  /* Les facteurs s'affichent en pourcentage, la rotation en degrés tels quels. */
  const ratio = unit === '%' ? PERCENT : 1;
  const number = input('number', { min: String(min * ratio), max: String(max * ratio), step: String(step * ratio) });
  number.addEventListener('input', () => {
    if (number.value === '') return;
    ctx.apply(updateInterpolationRange, interpolation.id, index, Number(number.value) / ratio);
  });
  trackOf(ctx, interpolation.id, (current) => {
    if (document.activeElement !== number) number.value = String(Math.round(current.range[index] * ratio));
  });

  const suffix = el('span', null, unit);
  suffix.setAttribute('aria-hidden', 'true');
  const wrapper = el('div', 'unit-input');
  /* `field` pose le libellé et le champ ; le champ passe ensuite dans son
     habillage à suffixe. */
  const wrap = field(labelText, number);
  wrapper.append(number, suffix);
  wrap.append(wrapper);
  return wrap;
};

/**
 * Rampe suivie : toutes les copies de la pile, ou l'indice d'un seul de ses
 * étages. Une pile vide n'a pas d'étage à nommer, donc pas de champ — le
 * proposer promettrait un réglage sans effet.
 */
const bindingField = (ctx, interpolation, modifiers) => {
  if (modifiers.length === 0) return null;
  const stages = modifiers.map((modifier, index) => [String(index), `${index + 1}. ${MODIFIER_LABELS[modifier.type]}`]);
  return field(
    'Rampe',
    choice('Rampe suivie', [['', 'Toutes les copies'], ...stages], String(interpolation.binding ?? ''), (value) =>
      ctx.apply(updateInterpolation, interpolation.id, { binding: value === '' ? null : Number(value) }),
    ),
  );
};

/* Forme de la rampe, par interpolation. Resynchronisée sans reconstruction :
   l'annulation la ramène sans arracher le bloc. Passer à l'aléatoire tire
   une graine neuve : deux bruits de la pile ne se suivent pas pas à pas. */
const curveField = (ctx, interpolation) => {
  const node = choice('Courbe de la rampe', Object.entries(CURVE_LABELS), interpolation.curve, (value) =>
    ctx.apply(updateInterpolation, interpolation.id, { curve: value, ...(value === 'random' ? { seed: randomSeed() } : {}) }),
  );
  /* Même réglage, autre tirage : un pas d'historique. */
  const reroll = textButton('Relancer', {
    focusKey: `reroll${ctx.key}${interpolation.id}`,
    onClick: () => ctx.apply(updateInterpolation, interpolation.id, { seed: randomSeed() }),
  });
  reroll.title = 'Tirer une autre graine';
  trackOf(ctx, interpolation.id, (current) => {
    node.value = current.curve;
    reroll.hidden = current.curve !== 'random';
  });
  const wrap = field('Courbe', node);
  wrap.append(reroll);
  return wrap;
};

const block = (ctx, interpolation, modifiers) => {
  const head = el('div', 'interpolation-head');
  head.append(
    choice('Propriété interpolée', Object.entries(RANGE_LABELS), interpolation.property, (value) =>
      ctx.apply(updateInterpolation, interpolation.id, { property: value }),
    ),
    iconButton({
      label: `Supprimer l'interpolation ${RANGE_LABELS[interpolation.property]}`,
      text: '×',
      focusKey: `delete-interpolation${ctx.key}${interpolation.id}`,
      danger: true,
      onClick: () => ctx.apply(removeInterpolation, interpolation.id),
    }),
  );
  const range = row(boundControl(ctx, interpolation, 0, 'Début'), boundControl(ctx, interpolation, 1, 'Fin'));
  const binding = bindingField(ctx, interpolation, modifiers);
  const root = el('div', 'interpolation-block');
  root.append(head, ...(binding ? [binding] : []), curveField(ctx, interpolation), range);
  return root;
};

/* Tout ce que les blocs affichent, sauf les valeurs des curseurs : les types
   des modificateurs en font partie, ils nomment les options de la rampe. */
const signature = (owner) =>
  JSON.stringify([
    owner.id,
    owner.interpolations.map((interpolation) => [interpolation.id, interpolation.property, interpolation.binding]),
    owner.modifiers.map((modifier) => modifier.type),
  ]);

/* `ownerOf(scene)` = le calque ou la forme dont la pile s'édite, ou `null` ;
   `key` distingue les clés de focus des deux sections montées. */
export const interpolationSection = ({ store, ownerOf, key = '' }) => {
  /* Contrôles rafraîchis sans reconstruction : les bornes et leurs lectures. */
  let bounds = [];
  const ctx = {
    key,
    apply: (transition, ...args) => {
      const owner = ownerOf(store.get());
      if (owner) store.apply(transition, owner.id, ...args);
    },
    track: (sync) => bounds.push(sync),
  };

  const host = el('div', 'stack');
  const addButton = textButton('+ Ajouter', {
    label: 'Ajouter une interpolation',
    focusKey: `add-interpolation${key}`,
    onClick: () => ctx.apply(addInterpolation),
  });
  const clearButton = textButton('Tout retirer', {
    className: 'text-btn is-dim',
    focusKey: `clear-interpolations${key}`,
    onClick: () => ctx.apply(clearInterpolations),
  });
  const set = el('section', 'group');
  const head = sectionHead('Faire varier les itérations', addButton);
  set.append(head, host, clearButton);
  const fold = collapsible(set, head, 'interpolations');

  let last = null;
  const mark = presence();
  const sync = (owner) => {
    if (!owner) return;
    const next = signature(owner);
    const rebuilt = next !== last;
    if (rebuilt) {
      last = next;
      rebuildWithFocus(host, () => {
        bounds = [];
        const nodes = owner.interpolations.map((interpolation) => block(ctx, interpolation, owner.modifiers));
        host.append(...nodes);
        return addButton;
      });
    }
    clearButton.hidden = owner.interpolations.length === 0;
    fold.summarize(countLabel(owner.interpolations.length, 'interpolation'));
    for (const control of bounds) control(owner);
    /* Mesurée une fois les bornes réglées : c'est la hauteur d'arrivée. */
    if (rebuilt) mark([...host.children].map((node, index) => [node, owner.interpolations[index].id]), owner.id, host);
  };

  return { root: set, sync };
};
