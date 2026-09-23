import {
  addBoolean,
  BOOLEAN_OPS,
  clampBooleanOp,
  getActiveElement,
  removeBoolean,
  SHAPES,
  updateBoolean,
} from '../scene.js';
import { iconButton, rebuildWithFocus, shapeName } from './list.js';

/**
 * Section « Booléen » d'une forme : une pile d'opérations appliquées dans
 * l'ordre, chacune avec son outil — une autre forme du calque — et son mode.
 * Fusionner deux disques puis y découper un carré est une pile de deux.
 *
 * Aucun curseur dedans : la section se reconstruit à chaque changement de ce
 * qu'elle montre, `rebuildWithFocus` rend le focus au contrôle qui l'avait.
 */
export const booleanSection = ({ store }) => {
  let uid = 0;

  const apply = (transition, ...args) => {
    const element = getActiveElement(store.get());
    if (element) store.apply(transition, element.id, ...args);
  };

  const toolSelect = (layer, element, step, index) => {
    const node = document.createElement('select');
    node.id = `boolean-${++uid}`;
    node.setAttribute('aria-label', `Outil de l'opération ${index + 1}`);
    node.dataset.focusKey = `boolean-tool${index}`;
    for (const other of layer.elements.filter((candidate) => candidate !== element)) {
      const option = document.createElement('option');
      option.value = other.id;
      option.textContent = shapeName(layer, other, SHAPES);
      node.append(option);
    }
    node.value = step.with;
    node.addEventListener('change', () => apply(updateBoolean, index, { with: node.value }));
    return node;
  };

  const opSegments = (step, index) => {
    const root = document.createElement('fieldset');
    root.className = 'segmented';
    const legend = document.createElement('legend');
    legend.textContent = 'Mode';
    const track = document.createElement('div');
    track.className = 'segments';
    const name = `boolean-op-${++uid}`;
    for (const [value, label] of Object.entries(BOOLEAN_OPS)) {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = value;
      radio.checked = step.op === value;
      radio.dataset.focusKey = `boolean-op${index}-${value}`;
      radio.addEventListener('change', () => {
        if (radio.checked) apply(updateBoolean, index, { op: clampBooleanOp(value) });
      });
      const wrap = document.createElement('label');
      wrap.className = 'segment';
      const text = document.createElement('span');
      text.textContent = label;
      wrap.append(radio, text);
      track.append(wrap);
    }
    root.append(legend, track);
    return root;
  };

  const block = (layer, element, step, index) => {
    const head = document.createElement('div');
    head.className = 'modifier-head';
    head.append(
      toolSelect(layer, element, step, index),
      iconButton({
        label: `Retirer l'opération ${index + 1}`,
        text: '×',
        focusKey: `delete-boolean${index}`,
        danger: true,
        onClick: () => apply(removeBoolean, index),
      }),
    );
    const root = document.createElement('div');
    root.className = 'modifier-block';
    root.append(head, opSegments(step, index));
    return root;
  };

  const set = document.createElement('section');
  set.className = 'group';
  const head = document.createElement('div');
  head.className = 'section-head';
  const title = document.createElement('h3');
  title.textContent = 'Booléen';
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'text-btn';
  addButton.textContent = '+ Ajouter';
  addButton.setAttribute('aria-label', 'Ajouter une opération booléenne');
  addButton.title = 'Ajouter une opération booléenne';
  addButton.dataset.focusKey = 'add-boolean';
  addButton.addEventListener('click', () => apply(addBoolean));
  head.append(title, addButton);
  const host = document.createElement('div');
  host.className = 'stack';
  set.append(head, host);

  /* Ce que la section montre : la pile, et les formes du calque qui nomment
     les outils possibles. */
  const signature = (layer, element) =>
    JSON.stringify([
      element.id,
      element.booleans,
      layer.elements.map((candidate) => [candidate.id, candidate.type]),
    ]);

  let last = null;

  const sync = (layer, element) => {
    if (!layer || !element) return;
    /* Seule, une forme n'a pas d'outil à qui s'opposer. */
    addButton.disabled = layer.elements.length < 2;
    const next = signature(layer, element);
    if (next === last) return;
    last = next;
    rebuildWithFocus(host, () => {
      host.append(...element.booleans.map((step, index) => block(layer, element, step, index)));
      return addButton;
    });
  };

  return { root: set, sync };
};
