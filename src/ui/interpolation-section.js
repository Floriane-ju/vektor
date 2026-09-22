import {
  addInterpolation,
  clearInterpolations,
  getActiveLayer,
  RANGE_BOUNDS,
  RANGE_LABELS,
  removeInterpolation,
  updateInterpolation,
  updateInterpolationRange,
} from '../scene.js';
import { MODIFIER_LABELS } from '../modifiers.js';
import { iconButton, rebuildWithFocus } from './list.js';

/**
 * Section « Interpolations » de la card du calque : une card par interpolation,
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
export const interpolationSection = ({ store }) => {
  let uid = 0;
  /* Contrôles rafraîchis sans reconstruction : les bornes et leurs lectures. */
  let bounds = [];

  const apply = (transition, ...args) => {
    const layer = getActiveLayer(store.get());
    if (layer) store.apply(transition, layer.id, ...args);
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

  /**
   * Une borne de la plage. Le curseur prend les bornes de la propriété : passer
   * une interpolation d'opacité à l'échelle rouvre la card, donc le `min` et le
   * `max` suivent sans réglage à la main.
   */
  const boundControl = (interpolation, index, labelText) => {
    const { min, max, step } = RANGE_BOUNDS[interpolation.property];
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `interp-${++uid}`;
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.addEventListener('input', () =>
      apply(updateInterpolationRange, interpolation.id, index, Number(slider.value)),
    );

    const readout = document.createElement('span');
    readout.className = 'range-value';

    bounds.push({
      sync: (layer) => {
        const current = layer.interpolations.find(
          (candidate) => candidate.id === interpolation.id,
        );
        if (!current) return;
        const value = current.range[index];
        if (document.activeElement !== slider) slider.value = String(value);
        readout.textContent = value.toFixed(2);
      },
    });

    const wrap = field(labelText, slider);
    wrap.querySelector('label').append(' ', readout);
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
        focusKey: `delete-interpolation${interpolation.id}`,
        danger: true,
        onClick: () => apply(removeInterpolation, interpolation.id),
      }),
    );

    const range = document.createElement('div');
    range.className = 'field-row';
    range.append(boundControl(interpolation, 0, 'Début'), boundControl(interpolation, 1, 'Fin'));

    const binding = bindingField(interpolation, modifiers);
    root.append(head, ...(binding ? [binding] : []), range);
    return root;
  };

  const set = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Interpolations';
  const host = document.createElement('div');

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.textContent = '+ Ajouter une interpolation';
  addButton.dataset.focusKey = 'add-interpolation';
  addButton.addEventListener('click', () => apply(addInterpolation));

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Tout retirer';
  clearButton.dataset.focusKey = 'clear-interpolations';
  clearButton.addEventListener('click', () => apply(clearInterpolations));

  const actions = document.createElement('div');
  actions.className = 'interpolation-actions';
  actions.append(addButton, clearButton);
  set.append(legend, host, actions);

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
    set.disabled = !layer;
    set.setAttribute('aria-disabled', String(!layer));
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

    clearButton.disabled = layer.interpolations.length === 0;
    for (const control of bounds) control.sync(layer);
  };

  return { root: set, sync };
};
