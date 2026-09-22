import { applyStack, createModifier, stackCopies } from './modifiers.js';
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
 * `geometry` est le nœud SVG émis. « dot » n'est pas un cercle : c'est un trait
 * de longueur nulle à bout rond, donc sans taille propre — son diamètre est
 * l'épaisseur du calque, et sa couleur celle du contour.
 *
 * `uniform` décide de la lecture du glissement : une forme uniforme reste
 * circulaire quelle que soit la direction du geste, un rectangle prend ses deux
 * dimensions indépendamment.
 *
 * `signed` marque les formes orientées : une ligne qui monte n'est pas la même
 * qu'une ligne qui descend, donc ses demi-extensions gardent leur signe au lieu
 * d'être ramenées à une valeur absolue.
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
    defaults: { rx: 60, ry: 60, fill: 'none', stroke: '#7dd3c0' },
  },
  point: {
    label: 'Point',
    geometry: 'dot',
    uniform: true,
    defaults: { rx: 0, ry: 0, fill: 'none', stroke: '#7dd3c0' },
  },
  rect: {
    label: 'Rectangle',
    geometry: 'rect',
    uniform: false,
    defaults: { rx: 70, ry: 45, fill: 'none', stroke: '#7dd3c0' },
  },
  line: {
    label: 'Ligne',
    geometry: 'line',
    uniform: false,
    signed: true,
    /* Sans contour, une ligne n'a rien à montrer : `fill` ne la peint pas. */
    defaults: { rx: 60, ry: 0, fill: 'none', stroke: '#7dd3c0' },
  },
};

export const DEFAULT_SHAPE = 'circle';

/**
 * L'épaisseur du trait appartient au calque, pas à la forme : un calque est un
 * coup de crayon, toutes ses formes sortent du même outil. C'est aussi ce qui
 * donne son diamètre au point, faute d'étendue propre.
 */
export const DEFAULT_STROKE_WIDTH = 1.5;

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

/**
 * Demi-extension admissible pour un type : négative seulement sur une forme
 * orientée. Seul endroit où cette borne est décidée, pour que le renderer,
 * l'import et le panneau propriétés n'en donnent pas trois lectures.
 */
export const clampExtent = (type, value) => (SHAPES[type].signed ? value : Math.max(0, value));

/**
 * Modifications produites par un glissement de (dx, dy) depuis `origin`.
 *
 * Une forme symétrique naît centrée sur le point de départ, qui ne bouge plus :
 * seules ses extensions grandissent. Une ligne se trace d'un bout à l'autre du
 * geste ; comme `x, y` doit rester le milieu de la forme — c'est ce que le
 * modèle suppose partout ailleurs, de l'échelle aux modificateurs — le centre
 * suit le curseur à mi-chemin et les demi-extensions valent la moitié du
 * déplacement.
 */
export const dragPatch = (type, origin, dx, dy) => {
  /* Un point n'a pas d'étendue : le geste le pose, l'épaisseur le dimensionne. */
  if (SHAPES[type].geometry === 'dot') return { rx: 0, ry: 0 };
  if (SHAPES[type].signed) {
    return { x: origin.x + dx / 2, y: origin.y + dy / 2, rx: dx / 2, ry: dy / 2 };
  }
  if (!SHAPES[type].uniform) return { rx: Math.abs(dx), ry: Math.abs(dy) };
  const radius = Math.hypot(dx, dy);
  return { rx: radius, ry: radius };
};

export const createLayer = (overrides = {}) => ({
  id: nextId('L'),
  name: `Calque ${counters.L}`,
  visible: true,
  center: { x: STAGE.width / 2, y: STAGE.height / 2 },
  strokeWidth: DEFAULT_STROKE_WIDTH,
  elements: [],
  /* Pile vide : le calque se rend tel quel. On empile ensuite les gestes. */
  modifiers: [],
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
 * Formes effectivement dessinées d'un calque : une copie du calque entier par
 * combinaison d'indices de la pile de modificateurs, portant le déplacement
 * cumulé de la pile et les propriétés interpolées de son rang.
 *
 * Les modificateurs s'appliquent au groupe, pas forme par forme : toutes les
 * formes d'une même copie subissent le même déplacement et partagent la même
 * opacité et la même échelle. C'est ce qui fait tourner un motif comme un motif.
 *
 * Empiler multiplie : deux modificateurs de 5 et 2 copies en font 10. La rampe
 * d'interpolation court sur ce total, pas sur chaque modificateur — sinon deux
 * copies voisines de la pile intérieure auraient la même opacité.
 *
 * Le résultat est groupé par copie, ce qui fixe aussi l'ordre de dessin à
 * l'intérieur du calque.
 *
 * ponytail: pas de mémoïsation. Il n'y a pas de boucle de rendu — le renderer
 * n'est rappelé que sur notification du store. Mesurer avant d'en ajouter.
 */
export const getRenderedChildren = (layer) => {
  if (layer.elements.length === 0) return [];
  const copies = stackCopies(layer.modifiers);

  const children = [];
  copies.forEach((indices, i) => {
    const properties = interpolateProps(layer.propertyRanges, i, copies.length);
    for (const element of layer.elements) {
      children.push({
        ...element,
        strokeWidth: layer.strokeWidth,
        ...applyStack(element, layer.modifiers, indices, layer.center),
        ...properties,
      });
    }
  });
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

export const setLayerStrokeWidth = (scene, id, strokeWidth) =>
  mapLayer(scene, id, (layer) => ({ ...layer, strokeWidth: Math.max(0, strokeWidth) }));

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
 * La nouvelle forme reprend les couleurs de la forme active, quel que soit son
 * type — dessiner dix formes rouges d'affilée ne doit pas demander de régler la
 * couleur dix fois. L'épaisseur n'en fait pas partie : elle vit sur le calque.
 */
export const addElement = (scene, layerId, type, x, y, overrides = {}) => {
  const previous = getActiveElement(scene);
  const style = previous ? { fill: previous.fill, stroke: previous.stroke } : {};
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

/* ---- Pile de modificateurs ---- */

export const addModifier = (scene, id) =>
  mapLayer(scene, id, (layer) => ({ ...layer, modifiers: [...layer.modifiers, createModifier()] }));

export const removeModifier = (scene, id, index) =>
  mapLayer(scene, id, (layer) => ({
    ...layer,
    modifiers: layer.modifiers.filter((_, i) => i !== index),
  }));

/** `delta` = -1 vers le début de la pile, +1 vers la fin. L'ordre change le dessin. */
export const moveModifier = (scene, id, index, delta) =>
  mapLayer(scene, id, (layer) => {
    const to = index + delta;
    if (to < 0 || to >= layer.modifiers.length) return layer;
    const modifiers = [...layer.modifiers];
    [modifiers[index], modifiers[to]] = [modifiers[to], modifiers[index]];
    return { ...layer, modifiers };
  });

export const updateModifier = (scene, id, index, patch) =>
  mapLayer(scene, id, (layer) => ({
    ...layer,
    modifiers: layer.modifiers.map((current, i) => {
      if (i !== index) return current;
      const modifier = { ...current, ...patch };
      return { ...modifier, n: clampCount(modifier.n) };
    }),
  }));

export const updateRange = (scene, id, property, index, value) =>
  mapLayer(scene, id, (layer) => {
    const range = [...layer.propertyRanges[property]];
    range[index] = value;
    return { ...layer, propertyRanges: { ...layer.propertyRanges, [property]: range } };
  });
