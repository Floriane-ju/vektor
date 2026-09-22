import { effectiveCount, MODIFIERS } from './modifiers.js';
import { clampCount, interpolateProps } from './interpolate.js';

export const STAGE = { width: 900, height: 900 };

/**
 * Bornes des propriétés interpolables — source unique.
 *
 * `identity` est la valeur neutre : celle d'un calque neuf, et celle sur
 * laquelle un fichier importé se replie quand la plage est absente. La faire
 * dériver de `max` donnait silencieusement `scale = 10` à l'import.
 */
export const RANGE_BOUNDS = {
  opacity: { min: 0, max: 1, step: 0.01, identity: 1 },
  scale: { min: 0, max: 3, step: 0.01, identity: 1 },
};

/**
 * Formes disponibles.
 *
 * `geometry` est le nœud SVG émis : « point » est un cercle, mais reste un type
 * à part entière parce qu'il a ses propres valeurs par défaut (plein, minuscule,
 * sans contour) et doit se relire comme tel dans un fichier.
 *
 * `uniform` décide de la lecture du glissement : une forme uniforme reste
 * circulaire quelle que soit la direction du geste, un rectangle prend ses deux
 * dimensions indépendamment.
 *
 * `rx` et `ry` sont des demi-extensions depuis le centre — ce qui fait du point
 * de départ du glissement le centre de la forme, donc le pivot naturel des
 * modificateurs axial et spirale.
 */
export const SHAPES = {
  circle: {
    label: 'Cercle',
    geometry: 'circle',
    uniform: true,
    defaults: { rx: 60, ry: 60, fill: 'none', stroke: '#7dd3c0', strokeWidth: 1.5 },
  },
  point: {
    label: 'Point',
    geometry: 'circle',
    uniform: true,
    defaults: { rx: 5, ry: 5, fill: '#7dd3c0', stroke: 'none', strokeWidth: 0 },
  },
  rect: {
    label: 'Rectangle',
    geometry: 'rect',
    uniform: false,
    defaults: { rx: 70, ry: 45, fill: 'none', stroke: '#7dd3c0', strokeWidth: 1.5 },
  },
};

export const DEFAULT_SHAPE = 'circle';

const counters = { L: 0, E: 0 };
const nextId = (prefix) => `${prefix}${++counters[prefix]}`;

export const createElement = (type, x, y, overrides = {}) => ({
  id: nextId('E'),
  ...SHAPES[type].defaults,
  type,
  x,
  y,
  ...overrides,
});

/** Demi-extensions produites par un glissement de (dx, dy) depuis le centre. */
export const dragExtent = (type, dx, dy) => {
  if (!SHAPES[type].uniform) return { rx: Math.abs(dx), ry: Math.abs(dy) };
  const radius = Math.hypot(dx, dy);
  return { rx: radius, ry: radius };
};

export const createLayer = (overrides = {}) => ({
  id: nextId('L'),
  name: `Calque ${counters.L}`,
  visible: true,
  center: { x: STAGE.width / 2, y: STAGE.height / 2 },
  elements: [],
  modifier: { type: 'none', n: 6, angleStep: 0.4, radiusStep: 12 },
  propertyRanges: { opacity: [1, 1], scale: [1, 1] },
  ...overrides,
});

export const createScene = () => {
  const layer = createLayer();
  return { layers: [layer], activeLayerId: layer.id, activeElementId: null };
};

/**
 * Réserve les identifiants déjà pris par une scène chargée depuis un fichier,
 * pour que les calques créés ensuite n'entrent pas en collision avec eux.
 */
export const reserveIds = (layers) => {
  const take = (id) => {
    const prefix = String(id).slice(0, 1);
    const parsed = Number.parseInt(String(id).slice(1), 10);
    if (prefix in counters && Number.isFinite(parsed)) {
      counters[prefix] = Math.max(counters[prefix], parsed);
    }
  };
  for (const layer of layers) {
    take(layer.id);
    for (const element of layer.elements) take(element.id);
  }
};

export const getActiveLayer = (scene) =>
  scene.layers.find((layer) => layer.id === scene.activeLayerId) ?? null;

export const getActiveElement = (scene) =>
  scene.layers.flatMap((layer) => layer.elements).find((el) => el.id === scene.activeElementId) ??
  null;

/**
 * Formes effectivement dessinées d'un calque : `n` copies du calque entier, la
 * copie `i` portant le déplacement du modificateur et les propriétés
 * interpolées de l'indice `i`.
 *
 * Le modificateur s'applique au groupe, pas forme par forme : toutes les formes
 * d'une même copie subissent le même déplacement et partagent la même opacité
 * et la même échelle. C'est ce qui fait tourner un motif comme un motif.
 *
 * Le résultat compte donc `n × elements.length` formes, groupées par copie —
 * ce qui fixe aussi l'ordre de dessin à l'intérieur du calque.
 *
 * ponytail: pas de mémoïsation. Il n'y a pas de boucle de rendu — le renderer
 * n'est rappelé que sur notification du store. Mesurer avant d'en ajouter.
 */
export const getRenderedChildren = (layer) => {
  if (layer.elements.length === 0) return [];
  const count = effectiveCount(layer.modifier);
  const transform = MODIFIERS[layer.modifier.type] ?? MODIFIERS.none;

  const children = [];
  for (let i = 0; i < count; i += 1) {
    const properties = interpolateProps(layer.propertyRanges, i, count);
    for (const element of layer.elements) {
      children.push({
        ...element,
        ...transform(element, i, count, layer.center, layer.modifier),
        ...properties,
      });
    }
  }
  return children;
};

/* ---- Transitions immuables : chaque fonction renvoie une nouvelle Scene ---- */

const mapLayer = (scene, id, fn) => ({
  ...scene,
  layers: scene.layers.map((layer) => (layer.id === id ? fn(layer) : layer)),
});

export const addLayer = (scene) => {
  const layer = createLayer();
  return { ...scene, layers: [...scene.layers, layer], activeLayerId: layer.id };
};

export const removeLayer = (scene, id) => {
  const removed = scene.layers.find((layer) => layer.id === id);
  if (!removed) return scene;
  const layers = scene.layers.filter((layer) => layer.id !== id);
  const activeLayerId =
    scene.activeLayerId === id ? (layers.at(-1)?.id ?? null) : scene.activeLayerId;
  /* Sans cela, `activeElementId` désignerait une forme qui n'existe plus et le
     panneau propriétés éditerait dans le vide. */
  const orphaned = removed.elements.some((element) => element.id === scene.activeElementId);
  return { layers, activeLayerId, activeElementId: orphaned ? null : scene.activeElementId };
};

export const setActiveLayer = (scene, id) => ({ ...scene, activeLayerId: id });

export const toggleVisibility = (scene, id) =>
  mapLayer(scene, id, (layer) => ({ ...layer, visible: !layer.visible }));

export const renameLayer = (scene, id, name) =>
  mapLayer(scene, id, (layer) => ({ ...layer, name }));

/** `delta` = -1 vers l'arrière-plan, +1 vers le premier plan. */
export const moveLayer = (scene, id, delta) => {
  const from = scene.layers.findIndex((layer) => layer.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= scene.layers.length) return scene;
  const layers = [...scene.layers];
  [layers[from], layers[to]] = [layers[to], layers[from]];
  return { ...scene, layers };
};

/* ---- Formes d'un calque ---- */

/**
 * Ajoute une forme au calque et la rend active.
 *
 * La nouvelle forme reprend le style de la forme active quand elle est du même
 * type — dessiner dix cercles rouges d'affilée ne doit pas demander de régler
 * la couleur dix fois. Un type différent repart de ses propres valeurs par
 * défaut, sans quoi un point hériterait du `fill: none` d'un cercle et serait
 * invisible.
 */
export const addElement = (scene, layerId, type, x, y, overrides = {}) => {
  const previous = getActiveElement(scene);
  const style =
    previous?.type === type
      ? { fill: previous.fill, stroke: previous.stroke, strokeWidth: previous.strokeWidth }
      : {};
  const element = createElement(type, x, y, { ...style, ...overrides });
  return {
    ...mapLayer(scene, layerId, (layer) => ({ ...layer, elements: [...layer.elements, element] })),
    activeElementId: element.id,
  };
};

export const setActiveElement = (scene, elementId) => ({ ...scene, activeElementId: elementId });

/** Les identifiants de forme sont uniques dans la scène : le calque est retrouvé. */
const mapElement = (scene, elementId, fn) => ({
  ...scene,
  layers: scene.layers.map((layer) =>
    layer.elements.some((element) => element.id === elementId)
      ? { ...layer, elements: fn(layer.elements) }
      : layer,
  ),
});

export const updateElement = (scene, elementId, patch) =>
  mapElement(scene, elementId, (elements) =>
    elements.map((element) => (element.id === elementId ? { ...element, ...patch } : element)),
  );

export const removeElement = (scene, elementId) => {
  const next = mapElement(scene, elementId, (elements) =>
    elements.filter((element) => element.id !== elementId),
  );
  if (scene.activeElementId !== elementId) return next;
  const layer = next.layers.find((candidate) => candidate.id === scene.activeLayerId);
  return { ...next, activeElementId: layer?.elements.at(-1)?.id ?? null };
};

/** `delta` = -1 vers l'arrière du calque, +1 vers l'avant. */
export const moveElement = (scene, elementId, delta) => {
  const layer = scene.layers.find((candidate) =>
    candidate.elements.some((element) => element.id === elementId),
  );
  if (!layer) return scene;
  const from = layer.elements.findIndex((element) => element.id === elementId);
  const to = from + delta;
  if (to < 0 || to >= layer.elements.length) return scene;
  return mapElement(scene, elementId, (elements) => {
    const next = [...elements];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  });
};

export const updateModifier = (scene, id, patch) =>
  mapLayer(scene, id, (layer) => {
    const modifier = { ...layer.modifier, ...patch };
    return { ...layer, modifier: { ...modifier, n: clampCount(modifier.n) } };
  });

export const updateRange = (scene, id, property, index, value) =>
  mapLayer(scene, id, (layer) => {
    const range = [...layer.propertyRanges[property]];
    range[index] = value;
    return { ...layer, propertyRanges: { ...layer.propertyRanges, [property]: range } };
  });
