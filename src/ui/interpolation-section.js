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
import { copyCount, effectiveCount, MODIFIER_LABELS } from '../modifiers.js';
import { CURVE_LABELS, lerp, ramp } from '../interpolate.js';

/* Au-delà, l'aperçu de la rampe ne montre qu'un échantillon régulier. */
const PREVIEW_DOTS = 12;
/* Les bornes se saisissent en pourcentage : 1 = 100 %. */
const PERCENT = 100;
import { iconButton, rebuildWithFocus } from './list.js';

/**
 * Section « Faire varier les itérations » du calque : un bloc par interpolation,
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
   * Une borne de la plage, en pourcentage. Le champ prend les bornes de la
   * propriété : passer une interpolation d'opacité à l'échelle reconstruit le
   * bloc, donc le `min` et le `max` suivent sans réglage à la main.
   */
  const boundControl = (interpolation, index, labelText) => {
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
   * Aperçu de la rampe : une pastille par copie suivie, estompée ou réduite
   * comme le fera le dessin. Il ne montre que cette interpolation, pas le
   * produit de toute la pile.
   */
  const preview = (interpolation) => {
    const root = document.createElement('div');
    root.className = 'ramp-preview';
    root.setAttribute('aria-hidden', 'true');
    bounds.push({
      sync: (layer) => {
        const current = layer.interpolations.find((candidate) => candidate.id === interpolation.id);
        if (!current) return;
        const stage = current.binding == null ? null : layer.modifiers[current.binding];
        const n = stage ? effectiveCount(stage) : copyCount(layer.modifiers);
        const shown = Math.min(n, PREVIEW_DOTS);
        const dots = Array.from({ length: shown }, (_, i) => {
          const value = lerp(current.range[0], current.range[1], ramp(current.curve, Math.round((i * (n - 1)) / Math.max(1, shown - 1)), n));
          const dot = document.createElement('span');
          if (current.property === 'opacity') dot.style.opacity = String(value);
          else if (current.property === 'rotation') dot.style.transform = `rotate(${value}deg)`;
          else if (current.property === 'strokeWidth') dot.style.boxShadow = `inset 0 0 0 ${Math.min(value * 2, 7)}px var(--layer-color, var(--accent))`;
          else dot.style.transform = `scale(${Math.min(value, 1.6)})`;
          return dot;
        });
        /* Une pastille ronde ne montre pas sa rotation : la vrille s'aperçoit en barrettes. */
        root.classList.toggle('is-rotation', current.property === 'rotation');
        root.replaceChildren(...dots);
      },
    });
    return root;
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
     l'annulation la ramène sans arracher le bloc. */
  const curveField = (interpolation) => {
    const node = select('Courbe de la rampe', Object.entries(CURVE_LABELS), interpolation.curve, (value) =>
      apply(updateInterpolation, interpolation.id, { curve: value }),
    );
    bounds.push({
      sync: (layer) => {
        const current = layer.interpolations.find((candidate) => candidate.id === interpolation.id);
        if (current) node.value = current.curve;
      },
    });
    return field('Courbe', node);
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
    root.append(head, ...(binding ? [binding] : []), curveField(interpolation), range, preview(interpolation));
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
  addButton.dataset.focusKey = 'add-interpolation';
  addButton.addEventListener('click', () => apply(addInterpolation));
  head.append(title, addButton);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'text-btn is-dim';
  clearButton.textContent = 'Tout retirer';
  clearButton.dataset.focusKey = 'clear-interpolations';
  clearButton.addEventListener('click', () => apply(clearInterpolations));

  set.append(head, host, clearButton);

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
    for (const control of bounds) control.sync(layer);
  };

  return { root: set, sync };
};
