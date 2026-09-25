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

/* Les bornes se saisissent en pourcentage : 1 = 100 %. */
const PERCENT = 100;
import { iconButton, rebuildWithFocus } from './list.js';
import { collapsible, countLabel } from './fields.js';

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
 */
/* `ownerOf(scene)` = le calque ou la forme dont la pile s'édite, ou `null` ;
   `key` distingue les clés de focus des deux sections montées. */
export const interpolationSection = ({ store, ownerOf, key = '' }) => {
  let uid = 0;
  /* Contrôles rafraîchis sans reconstruction : les bornes et leurs lectures. */
  let bounds = [];

  const apply = (transition, ...args) => {
    const owner = ownerOf(store.get());
    if (owner) store.apply(transition, owner.id, ...args);
  };

  const option = (value, label) => {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  };

  const select = (label, options, value, onChange) => {
    const node = document.createElement('select');
    node.id = `interp-${++uid}`;
    node.setAttribute('aria-label', label);
    node.append(...options.map(([optionValue, optionLabel]) => option(optionValue, optionLabel)));
    node.value = value;
    node.addEventListener('change', () => onChange(node.value));
    return node;
  };

  const field = (labelText, control) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = labelText;
    label.htmlFor = control.id;
    wrap.append(label, control);
    return wrap;
  };

  /* Borne d'une interpolation de couleur : le sélecteur natif, qui ne lit et
     n'écrit que `#rrggbb`, le format du modèle. */
  const colorControl = (interpolation, index, labelText) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.id = `interp-${++uid}`;
    input.addEventListener('input', () => apply(updateInterpolationRange, interpolation.id, index, input.value));
    bounds.push({
      sync: (layer) => {
        const current = layer.interpolations.find((candidate) => candidate.id === interpolation.id);
        if (current && document.activeElement !== input) input.value = current.range[index];
      },
    });
    return field(labelText, input);
  };

  /**
   * Une borne de la plage, en pourcentage. Le champ prend les bornes de la
   * propriété : passer une interpolation d'opacité à l'échelle reconstruit le
   * bloc, donc le `min` et le `max` suivent sans réglage à la main.
   */
  const boundControl = (interpolation, index, labelText) => {
    if (RANGE_BOUNDS[interpolation.property].color) return colorControl(interpolation, index, labelText);
    const { min, max, step, unit = '%' } = RANGE_BOUNDS[interpolation.property];
    /* Les facteurs s'affichent en pourcentage, la rotation en degrés tels quels. */
    const ratio = unit === '%' ? PERCENT : 1;
    const number = document.createElement('input');
    number.type = 'number';
    number.id = `interp-${++uid}`;
    number.min = String(min * ratio);
    number.max = String(max * ratio);
    number.step = String(step * ratio);
    number.addEventListener('input', () => {
      if (number.value === '') return;
      apply(updateInterpolationRange, interpolation.id, index, Number(number.value) / ratio);
    });

    bounds.push({
      sync: (layer) => {
        const current = layer.interpolations.find(
          (candidate) => candidate.id === interpolation.id,
        );
        if (!current) return;
        const value = Math.round(current.range[index] * ratio);
        if (document.activeElement !== number) number.value = String(value);
      },
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'unit-input';
    const suffix = document.createElement('span');
    suffix.setAttribute('aria-hidden', 'true');
    suffix.textContent = unit;
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
  const bindingField = (interpolation, modifiers) => {
    if (modifiers.length === 0) return null;
    return field(
      'Rampe',
      select(
        'Rampe suivie',
        [
          ['', 'Toutes les copies'],
          ...modifiers.map((modifier, index) => [
            String(index),
            `${index + 1}. ${MODIFIER_LABELS[modifier.type]}`,
          ]),
        ],
        String(interpolation.binding ?? ''),
        (value) =>
          apply(updateInterpolation, interpolation.id, {
            binding: value === '' ? null : Number(value),
          }),
      ),
    );
  };

  /* Forme de la rampe, par interpolation. Resynchronisée sans reconstruction :
     l'annulation la ramène sans arracher le bloc. Passer à l'aléatoire tire
     une graine neuve : deux bruits de la pile ne se suivent pas pas à pas. */
  const curveField = (interpolation) => {
    const node = select('Courbe de la rampe', Object.entries(CURVE_LABELS), interpolation.curve, (value) =>
      apply(updateInterpolation, interpolation.id, { curve: value, ...(value === 'random' ? { seed: randomSeed() } : {}) }),
    );
    /* Même réglage, autre tirage : un pas d'historique. */
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'text-btn';
    reroll.textContent = 'Relancer';
    reroll.title = 'Tirer une autre graine';
    reroll.dataset.focusKey = `reroll${key}${interpolation.id}`;
    reroll.addEventListener('click', () => apply(updateInterpolation, interpolation.id, { seed: randomSeed() }));
    bounds.push({
      sync: (layer) => {
        const current = layer.interpolations.find((candidate) => candidate.id === interpolation.id);
        if (!current) return;
        node.value = current.curve;
        reroll.hidden = current.curve !== 'random';
      },
    });
    const wrap = field('Courbe', node);
    wrap.append(reroll);
    return wrap;
  };

  const block = (interpolation, modifiers) => {
    const root = document.createElement('div');
    root.className = 'interpolation-block';

    const head = document.createElement('div');
    head.className = 'interpolation-head';
    head.append(
      select(
        'Propriété interpolée',
        Object.entries(RANGE_LABELS),
        interpolation.property,
        (value) => apply(updateInterpolation, interpolation.id, { property: value }),
      ),
      iconButton({
        label: `Supprimer l'interpolation ${RANGE_LABELS[interpolation.property]}`,
        text: '×',
        focusKey: `delete-interpolation${key}${interpolation.id}`,
        danger: true,
        onClick: () => apply(removeInterpolation, interpolation.id),
      }),
    );

    const range = document.createElement('div');
    range.className = 'field-row';
    range.append(boundControl(interpolation, 0, 'Début'), boundControl(interpolation, 1, 'Fin'));

    const binding = bindingField(interpolation, modifiers);
    root.append(head, ...(binding ? [binding] : []), curveField(interpolation), range);
    return root;
  };

  const set = document.createElement('section');
  set.className = 'group';
  const head = document.createElement('div');
  head.className = 'section-head';
  const title = document.createElement('h3');
  title.textContent = 'Faire varier les itérations';
  const host = document.createElement('div');
  host.className = 'stack';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'text-btn';
  addButton.textContent = '+ Ajouter';
  addButton.title = 'Ajouter une interpolation';
  addButton.setAttribute('aria-label', 'Ajouter une interpolation');
  addButton.dataset.focusKey = `add-interpolation${key}`;
  addButton.addEventListener('click', () => apply(addInterpolation));
  head.append(title, addButton);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'text-btn is-dim';
  clearButton.textContent = 'Tout retirer';
  clearButton.dataset.focusKey = `clear-interpolations${key}`;
  clearButton.addEventListener('click', () => apply(clearInterpolations));

  set.append(head, host, clearButton);
  const fold = collapsible(set, head, 'interpolations');

  /* Tout ce que les blocs affichent, sauf les valeurs des curseurs : les types
     des modificateurs en font partie, ils nomment les options de la rampe. */
  const signature = (layer) =>
    JSON.stringify([
      layer.id,
      layer.interpolations.map((interpolation) => [
        interpolation.id,
        interpolation.property,
        interpolation.binding,
      ]),
      layer.modifiers.map((modifier) => modifier.type),
    ]);

  let last = null;

  const sync = (layer) => {
    if (!layer) return;

    const next = signature(layer);
    if (next !== last) {
      last = next;
      rebuildWithFocus(host, () => {
        bounds = [];
        host.append(
          ...layer.interpolations.map((interpolation) => block(interpolation, layer.modifiers)),
        );
        return addButton;
      });
    }

    clearButton.hidden = layer.interpolations.length === 0;
    fold.summarize(countLabel(layer.interpolations.length, 'interpolation'));
    for (const control of bounds) control.sync(layer);
  };

  return { root: set, sync };
};
