import {
  addBoolean,
  BOOLEAN_OPS,
  clampBooleanOp,
  closesLoop,
  getActiveElement,
  isClosedShape,
  removeBoolean,
  SHAPES,
  updateBoolean,
} from '../scene.js';
import { iconButton, presence, rebuildWithFocus, shapeName, stableKeys } from './list.js';
import { addButtonFor, collapsible, countLabel, el, option, sectionHead, segmented } from './fields.js';

/* Outil d'une opération : une autre forme du calque. L'outil actuel reste
   offert — il ne ferme pas de boucle, sinon il n'aurait pas été posé. */
const toolSelect = (apply, layer, element, step, index) => {
  const node = el('select');
  node.setAttribute('aria-label', `Outil de l'opération ${index + 1}`);
  node.dataset.focusKey = `boolean-tool${index}`;
  const tools = layer.elements.filter(
    (candidate) =>
      candidate !== element &&
      isClosedShape(candidate) &&
      (candidate.id === step.with || !closesLoop(layer, element.id, candidate.id)),
  );
  node.append(...tools.map((other) => option(other.id, shapeName(layer, other, SHAPES))));
  node.value = step.with;
  node.addEventListener('change', () => apply(updateBoolean, index, { with: node.value }));
  return node;
};

const block = (apply, layer, element, step, index) => {
  const head = el('div', 'modifier-head');
  head.append(
    toolSelect(apply, layer, element, step, index),
    iconButton({
      label: `Retirer l'opération ${index + 1}`,
      text: '×',
      focusKey: `delete-boolean${index}`,
      danger: true,
      onClick: () => apply(removeBoolean, index),
    }),
  );
  const mode = segmented(
    'Mode',
    Object.entries(BOOLEAN_OPS),
    (value) => apply(updateBoolean, index, { op: clampBooleanOp(value) }),
    (value) => `boolean-op${index}-${value}`,
  );
  mode.check(step.op);
  const root = el('div', 'modifier-block');
  root.append(head, mode.root);
  return root;
};

/* Ce que la section montre : la pile, et les formes du calque qui nomment
   les outils possibles. */
const signature = (layer, element) =>
  JSON.stringify([
    element.id,
    element.booleans,
    layer.elements.map((candidate) => [candidate.id, candidate.type, candidate.name, candidate.booleans, isClosedShape(candidate)]),
  ]);

/**
 * Section « Booléen » d'une forme : une pile d'opérations appliquées dans
 * l'ordre, chacune avec son outil — une autre forme du calque — et son mode.
 * Fusionner deux disques puis y découper un carré est une pile de deux.
 *
 * Aucun curseur dedans : la section se reconstruit à chaque changement de ce
 * qu'elle montre, `rebuildWithFocus` rend le focus au contrôle qui l'avait.
 */
export const booleanSection = ({ store }) => {
  const apply = (transition, ...args) => {
    const element = getActiveElement(store.get());
    if (element) store.apply(transition, element.id, ...args);
  };

  const addButton = addButtonFor('Ajouter une opération booléenne', 'add-boolean', () => apply(addBoolean));
  const head = sectionHead('Booléen', addButton);
  const host = el('div', 'stack');
  const set = el('section', 'group');
  set.append(head, host);
  const fold = collapsible(set, head, 'booleans');

  let last = null;
  const mark = presence();
  const keysOf = stableKeys();

  const sync = (layer, element) => {
    if (!layer || !element) return;
    /* Seule, ou entourée d'outils qui fermeraient une boucle : rien à ajouter. */
    const scene = store.get();
    addButton.disabled = addBoolean(scene, element.id) === scene;
    fold.summarize(countLabel(element.booleans.length, 'opération'));
    const keys = keysOf(element.booleans);
    const next = signature(layer, element);
    if (next === last) return;
    last = next;
    rebuildWithFocus(host, () => {
      const nodes = element.booleans.map((step, index) => block(apply, layer, element, step, index));
      host.append(...nodes);
      mark(nodes.map((node, index) => [node, keys[index]]), element.id, host);
      return addButton;
    });
  };

  return { root: set, sync };
};
