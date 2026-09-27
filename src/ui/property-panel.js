import { getActiveElement, getActiveLayer, isBooleanTool, isClosedShape, setLayerEvenOdd, SHAPES } from '../scene.js';
import { shapeName } from './list.js';
import { interpolationSection } from './interpolation-section.js';
import { modifierSection } from './modifier-section.js';
import { booleanSection } from './boolean-section.js';
import { shapeFields } from './shape-fields.js';
import { strokeFields } from './stroke-fields.js';
import { planeFields } from './plane-fields.js';
import { bindControl, el, input, section, showValue, slider as sliderOf, switchField } from './fields.js';

/**
 * Panneau de droite : les réglages du calque actif, ou ceux de la forme
 * sélectionnée — jamais les deux. Construits une seule fois et ensuite
 * synchronisés.
 *
 * Les reconstruire à chaque notification arracherait le focus du curseur en
 * cours de glissement : chaque `input` notifie le store, qui redessine — et le
 * slider disparaîtrait sous la souris au premier pixel.
 */

/* Entête du panneau : ce qu'on règle (« Calque », « Forme ») et son nom. */
const inspectorHead = (kind) => {
  const head = el('div', 'inspector-head');
  const eyebrow = el('div', 'inspector-kind');
  eyebrow.append(el('span', null, kind));
  const title = el('h2', 'inspector-title');
  head.append(eyebrow, title);
  return { head, title };
};

/**
 * Relie les champs du panneau au store. `subject` dit ce qu'un contrôle édite :
 * la forme active (défaut) ou le calque actif ; il ne s'écrit pas quand son
 * sujet est absent. `sync` recopie le modèle dans tous les contrôles.
 */
const createBinder = (store) => {
  const controls = [];
  const bind = (node, read, write, { subject = 'element', ...options } = {}) => {
    const resolve = subject === 'element' ? getActiveElement : getActiveLayer;
    controls.push({ node, read, subject });
    return bindControl(node, () => resolve(store.get()), write, options);
  };
  const sync = (subjects) => {
    for (const { node, read, subject } of controls) {
      if (subjects[subject]) showValue(node, read(subjects[subject]));
    }
  };
  return { bind, slider: (...args) => sliderOf(bind, ...args), sync };
};

/* Le calque d'une forme, ou rien. */
const layerOf = (scene, element) => element && scene.layers.find((candidate) => candidate.elements.includes(element));

/* Réglages de la forme active. Ses piles s'appliquent avant celles du calque. */
const shapeDetail = (store, binder) => {
  const head = inspectorHead('Forme');
  const shape = shapeFields({ store, bind: binder.bind });
  const stroke = strokeFields({ store, bind: binder.bind, slider: binder.slider });
  const elementOwner = (scene) => {
    const owner = getActiveElement(scene);
    const layer = layerOf(scene, owner);
    return layer ? { layer, owner } : null;
  };
  const modifiers = modifierSection({ store, ownerOf: elementOwner, forElement: true });
  const interpolations = interpolationSection({
    store,
    ownerOf: (scene) => elementOwner(scene)?.owner ?? null,
    key: '-element',
  });
  const booleans = booleanSection({ store });

  /* `fieldset` : un calque verrouillé fige les réglages de ses formes. */
  const root = el('fieldset', 'inspector-body');
  root.dataset.kind = 'shape';
  root.setAttribute('aria-label', 'Réglages de la forme');
  root.append(
    section(head.head),
    section(...shape.nodes),
    section(...stroke.nodes),
    section(modifiers.root),
    section(interpolations.root),
    section(booleans.root),
  );

  const sync = (scene, element) => {
    const layer = layerOf(scene, element);
    root.hidden = !element;
    root.disabled = layer?.locked === true;
    head.title.textContent = layer ? shapeName(layer, element, SHAPES) : '';
    modifiers.sync(scene);
    if (!element) return;
    shape.sync(element, layer);
    stroke.sync(element);
    booleans.sync(layer, element);
    interpolations.sync(element);
    /* Outil booléen : ni trait, ni remplissage ne se voient —
       seule sa géométrie compte. Ses propres booléens restent s'il en a,
       pour pouvoir les retirer. */
    const tool = isBooleanTool(layer, element);
    for (const node of stroke.nodes) node.hidden ||= tool;
    booleans.root.hidden = !isClosedShape(element) || (tool && element.booleans.length === 0);
  };
  return { root, sync };
};

/* Réglages du calque actif, quand aucune forme n'est sélectionnée. */
const layerDetail = (store, binder) => {
  const head = inspectorHead('Calque');
  /* Les formes remplies du calque, copies comprises, en un tracé pair-impair. */
  const evenOdd = binder.bind(
    input('checkbox'),
    (layer) => layer.evenOdd,
    (layer, value) => store.apply(setLayerEvenOdd, layer.id, value),
    { subject: 'layer', event: 'change' },
  );
  const evenOddField = switchField('Recoupements creux', evenOdd);
  evenOddField.title = 'Là où deux formes remplies se recouvrent, le remplissage se creuse';
  const modifiers = modifierSection({
    store,
    ownerOf: (scene) => {
      const layer = getActiveLayer(scene);
      return layer && { layer, owner: layer };
    },
  });
  /* La rampe d'une interpolation se lie à un étage de la pile voisine. */
  const interpolations = interpolationSection({ store, ownerOf: (scene) => getActiveLayer(scene) });
  const plane = planeFields({ store, bind: binder.bind, slider: binder.slider });

  /* Un `fieldset` pour tout désactiver d'un coup : plus de calque, ou calque verrouillé. */
  const root = el('fieldset', 'inspector-body');
  root.dataset.kind = 'layer';
  root.setAttribute('aria-label', 'Réglages du calque');
  root.append(
    section(head.head),
    section(evenOddField),
    section(modifiers.root),
    section(interpolations.root),
    section(plane.root),
  );

  const sync = (scene, layer, element) => {
    root.hidden = Boolean(element);
    /* Sans calque, ou calque verrouillé : lisible, rien ne s'édite. */
    root.disabled = !layer || layer.locked === true;
    root.setAttribute('aria-disabled', String(root.disabled));
    head.title.textContent = layer?.name ?? 'Aucun calque';
    modifiers.sync(scene);
    plane.sync(layer);
    interpolations.sync(layer);
  };
  return { root, sync };
};

export const mountPropertyPanel = ({ store, container = null }) => {
  const binder = createBinder(store);
  const layer = layerDetail(store, binder);
  const shape = shapeDetail(store, binder);
  container?.append(layer.root, shape.root);

  /* Une forme sélectionnée prend tout le panneau ; sinon, son calque. */
  const sync = (scene) => {
    const activeLayer = getActiveLayer(scene);
    const element = getActiveElement(scene);
    binder.sync({ layer: activeLayer, element });
    layer.sync(scene, activeLayer, element);
    shape.sync(scene, element);
  };

  store.subscribe(sync);
  sync(store.get());
  return { layerDetail: layer.root, shapeDetail: shape.root };
};
