import { clampAxis, clampGrowth, createModifier } from './modifiers.js';
import { clampCount } from './interpolate.js';
import { clamp } from './math.js';
import { activePlane, centerPoints, clampHeading, clampPlaneSides, clampTilt, DEFAULT_BOOLEAN_OP, DEFAULT_DEPTH, DEFAULT_PLANE, DEFAULT_LINECAP, DEFAULT_OUTLINE_GAP, DEFAULT_STROKE, DEFAULT_STROKE_WIDTH, RANGE_BOUNDS, rotateVector, SHAPES, STAGE } from './model.js';

export * from './model.js';
export * from './rendered.js';

const counters = { L: 0, E: 0, I: 0 };
const nextId = (prefix) => `${prefix}${++counters[prefix]}`;

/* `rotation` en degrés, autour du centre `x, y` : l'angle appartient à la
   forme, deux formes d'un même dessin s'inclinent rarement pareil.
   `booleans` = pile d'opérations booléennes `{ with, op }`, appliquées dans
   l'ordre : `with` désigne une autre forme du même calque, l'outil. L'outil
   ne se dessine plus, la forme rend le résultat avec son propre style. */
export const createElement = (type, x, y, overrides = {}) => ({
  id: nextId('E'),
  rotation: 0,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  stroke: DEFAULT_STROKE,
  dash: [],
  linecap: DEFAULT_LINECAP,
  outlined: false,
  gap: DEFAULT_OUTLINE_GAP,
  booleans: [],
  /* Profondeur d'extrusion le long de la normale du plan 3D du calque, centrée
     sur le plan (10 : de -5 à 5). Sans plan, sans effet. */
  height: 0,
  /* En 3D, le volume cache ce qui est derrière lui (`hidden.js`) ; éteint, fil
     de fer : il ne cache rien, pas même ses propres arêtes arrière. */
  opaque: true,
  /* Piles propres de la forme, appliquées avant celles du calque : ses copies
     se multiplient avec les siennes (`getRenderedChildren`). */
  modifiers: [],
  interpolations: [],
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
 * déplacement. `constrained` (Maj) équilibre le geste : carré, cercle, 45°.
 */
export const dragPatch = (type, origin, dx, dy, constrained = false) => {
  /* Un point n'a pas d'étendue : le geste le pose, l'épaisseur le dimensionne. */
  if (SHAPES[type].geometry === 'dot') return { rx: 0, ry: 0 };
  if (SHAPES[type].signed) {
    if (constrained) {
      /* Maj : l'angle s'aimante par pas de 45°, la longueur reste celle du geste. */
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      const length = Math.hypot(dx, dy);
      [dx, dy] = [length * Math.cos(angle), length * Math.sin(angle)];
    }
    return { x: origin.x + dx / 2, y: origin.y + dy / 2, rx: dx / 2, ry: dy / 2 };
  }
  if (!SHAPES[type].uniform) {
    if (!constrained) return { rx: Math.abs(dx), ry: Math.abs(dy) };
    /* Maj : ellipse → cercle, rectangle → carré, sur la plus grande extension. */
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { rx: side, ry: side };
  }
  const radius = Math.hypot(dx, dy);
  return { rx: radius, ry: radius };
};

export const createLayer = (overrides = {}) => ({
  id: nextId('L'),
  name: `Calque ${counters.L}`,
  visible: true,
  center: { x: STAGE.width / 2, y: STAGE.height / 2 },
  elements: [],
  /* Pile vide : le calque se rend tel quel. On empile ensuite les gestes. */
  modifiers: [],
  /* Pile vide : toutes les copies se rendent pareilles. */
  interpolations: [],
  /* « Recoupements creux » : les formes remplies du calque, copies comprises,
     se peignent en un seul tracé pair-impair — leurs recoupements se creusent. */
  evenOdd: false,
  /* Plan 3D (`plane.js`) : `null` = jamais activé, sinon `{ enabled, tilt,
     heading, sides }` — éteint, le calque est à plat mais garde ses réglages. */
  plane: null,
  ...overrides,
});

/**
 * Une interpolation fait courir une propriété d'une valeur à l'autre le long
 * des copies. Le calque en porte une pile, comme il porte celle des
 * modificateurs : c'est la même pile de gestes, appliquée aux propriétés
 * plutôt qu'aux positions.
 *
 * `binding` = rang du modificateur dont l'indice mène seul la rampe, ou `null`
 * pour la rampe globale qui court sur le total des copies. Un rang ne désigne
 * un étage que dans la pile de ce calque — d'où l'intérêt de les loger au même
 * endroit.
 *
 * La pile s'ajoute par produit et non par écrasement, donc deux interpolations
 * d'opacité se composent — voir `stackValues`.
 *
 * `curve` = forme de la rampe, clé de `CURVES` (`interpolate.js`). `seed` =
 * graine de la courbe aléatoire, ignorée par les autres.
 */
export const createInterpolation = (overrides = {}) => ({
  id: nextId('I'),
  property: 'opacity',
  range: [...RANGE_BOUNDS.opacity.defaultRange],
  binding: null,
  curve: 'linear',
  seed: 0,
  ...overrides,
});

export const createScene = () => {
  const layer = createLayer({ name: layerName([]) });
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
    for (const interpolation of layer.interpolations) take(interpolation.id);
    for (const element of layer.elements) {
      take(element.id);
      for (const interpolation of element.interpolations) take(interpolation.id);
    }
  }
};

export const getActiveLayer = (scene) =>
  scene.layers.find((layer) => layer.id === scene.activeLayerId) ?? null;

export const getActiveElement = (scene) =>
  scene.layers.flatMap((layer) => layer.elements).find((el) => el.id === scene.activeElementId) ??
  null;

/* ---- Transitions immuables : chaque fonction renvoie une nouvelle Scene ---- */

const mapLayer = (scene, id, fn) => ({
  ...scene,
  layers: scene.layers.map((layer) => (layer.id === id ? fn(layer) : layer)),
});

/* Numéro suivant dans ce dessin, pas le compteur d'ids : celui-ci est commun à
   tous les onglets. Un calque renommé compte pour sa place. */
const layerName = (layers) => {
  const numbers = layers.map((layer) => Number(/^Calque (\d+)$/.exec(layer.name)?.[1] ?? 0));
  return `Calque ${Math.max(layers.length, ...numbers) + 1}`;
};

export const addLayer = (scene) => {
  const layer = createLayer({ name: layerName(scene.layers) });
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

/**
 * Copie posée juste au-dessus de l'original, pile complète comprise. Formes et
 * interpolations reçoivent des ids neufs ; les booléens suivent leurs outils
 * dans la copie. Les liaisons (rangs de modificateurs) restent valables telles
 * quelles, la pile étant recopiée à l'identique.
 */
export const duplicateLayer = (scene, id) => {
  const index = scene.layers.findIndex((layer) => layer.id === id);
  if (index < 0) return scene;
  const source = scene.layers[index];
  const ids = new Map(source.elements.map((element) => [element.id, nextId('E')]));
  const copy = {
    ...source,
    id: nextId('L'),
    name: `${source.name} (copie)`,
    elements: source.elements.map((element) => ({
      ...element,
      id: ids.get(element.id),
      interpolations: element.interpolations.map((interpolation) => ({ ...interpolation, id: nextId('I') })),
      booleans: element.booleans.map((step) => ({ ...step, with: ids.get(step.with) ?? step.with })),
    })),
    interpolations: source.interpolations.map((interpolation) => ({ ...interpolation, id: nextId('I') })),
  };
  return {
    ...scene,
    layers: scene.layers.toSpliced(index + 1, 0, copy),
    activeLayerId: copy.id,
    activeElementId: null,
  };
};

export const setActiveLayer = (scene, id) => ({ ...scene, activeLayerId: id });

export const toggleVisibility = (scene, id) =>
  mapLayer(scene, id, (layer) => ({ ...layer, visible: !layer.visible }));

/* Calque verrouillé : `locked: true`, absent sinon. Ses formes ne se
   saisissent plus sur le plan et ses réglages se figent ; il reste dessiné. */
export const toggleLock = (scene, id) =>
  mapLayer(scene, id, (layer) => {
    const { locked, ...rest } = layer;
    return locked ? rest : { ...rest, locked: true };
  });

/** Forme d'un calque verrouillé (ou introuvable) : ni sélection au plan, ni geste. */
export const isLockedElement = (scene, elementId) => {
  const layer = layerOfElement(scene, elementId);
  return !layer || layer.locked === true;
};

/* Forme masquée : `hidden: true`, absent sinon. Elle ne se dessine plus mais
   reste outil booléen ou hôte, comme le calque masqué garde ses formes. */
export const toggleElementVisibility = (scene, elementId) => {
  if (!scene.layers.some((layer) => layer.elements.some((element) => element.id === elementId))) return scene;
  return mapElement(scene, elementId, (elements) =>
    elements.map((element) => {
      if (element.id !== elementId) return element;
      const { hidden, ...rest } = element;
      return hidden ? rest : { ...rest, hidden: true };
    }),
  );
};

export const renameLayer = (scene, id, name) =>
  mapLayer(scene, id, (layer) => ({ ...layer, name }));

/** Au-delà, un nom collé déborde de toute ligne de l'arbre : il est coupé. */
export const MAX_NAME_LENGTH = 80;

/* Nom propre d'une forme, borné. Vide, elle le perd et reprend son libellé par
   défaut — son type et son rang (`shapeName`). */
export const renameElement = (scene, elementId, name) => {
  const next = String(name ?? '').trim().slice(0, MAX_NAME_LENGTH);
  const element = scene.layers.flatMap((layer) => layer.elements).find((candidate) => candidate.id === elementId);
  if (!element || (element.name ?? '') === next) return scene;
  return mapElement(scene, elementId, (elements) =>
    elements.map((candidate) => {
      if (candidate.id !== elementId) return candidate;
      const { name: _previous, ...rest } = candidate;
      return next ? { ...rest, name: next } : rest;
    }),
  );
};

/** Pivot par défaut des modificateurs du calque. Une coordonnée non finie est ignorée. */
export const setLayerCenter = (scene, id, { x, y }) =>
  Number.isFinite(x) && Number.isFinite(y)
    ? mapLayer(scene, id, (layer) => ({ ...layer, center: { x, y } }))
    : scene;

/**
 * Pivot effectivement utilisé par l'étage `index` de la pile de `owner` (le
 * calque, ou l'une de ses formes) : le sien, ou celui du calque.
 */
export const pivotOf = (layer, index, owner = layer) => owner.modifiers[index]?.center ?? layer.center;

export const setLayerEvenOdd = (scene, id, evenOdd) =>
  mapLayer(scene, id, (layer) => ({ ...layer, evenOdd: Boolean(evenOdd) }));

/**
 * Allume et règle le plan 3D du calque, ou l'éteint (`null`) en gardant ses
 * réglages pour le rallumer tel quel. Un réglage partiel complète le plan
 * courant, ou le plan par défaut s'il n'y en a jamais eu.
 */
export const setLayerPlane = (scene, id, patch) =>
  mapLayer(scene, id, (layer) => {
    if (patch === null) return activePlane(layer) ? { ...layer, plane: { ...layer.plane, enabled: false } } : layer;
    const next = { ...DEFAULT_PLANE, ...layer.plane, ...patch };
    /* Première activation seulement : les formes sans profondeur prennent
       celle par défaut. Ensuite chacune garde la sienne, zéro compris. */
    const elements = layer.plane
      ? layer.elements
      : layer.elements.map((element) => (element.height ? element : { ...element, height: DEFAULT_DEPTH }));
    return {
      ...layer,
      elements,
      plane: {
        enabled: true,
        tilt: clampTilt(next.tilt),
        heading: clampHeading(next.heading),
        sides: clampPlaneSides(next.sides),
      },
    };
  });

/** Bouton 3D de l'arbre : allume le plan éteint (ou le pose), éteint l'allumé. */
export const togglePlane = (scene, id) => {
  const layer = scene.layers.find((candidate) => candidate.id === id);
  return layer ? setLayerPlane(scene, id, activePlane(layer) ? null : {}) : scene;
};

/** `delta` = -1 vers l'arrière-plan, +1 vers le premier plan. */
export const moveLayer = (scene, id, delta) => {
  const from = scene.layers.findIndex((layer) => layer.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= scene.layers.length) return scene;
  const layers = [...scene.layers];
  [layers[from], layers[to]] = [layers[to], layers[from]];
  return { ...scene, layers };
};

/* Retire `item` de `list` et le repose au rang `index` (borné) ; même
   référence si l'ordre ne change pas. */
const placeAt = (list, item, index) => {
  const rest = list.filter((candidate) => candidate !== item);
  const at = Math.max(0, Math.min(index, rest.length));
  const next = [...rest.slice(0, at), item, ...rest.slice(at)];
  return next.every((candidate, i) => candidate === list[i]) ? list : next;
};

/** Pose un calque au rang `index` de la pile (0 = fond) : glisser-déposer de l'arbre. */
export const placeLayer = (scene, id, index) => {
  const layer = scene.layers.find((candidate) => candidate.id === id);
  const layers = layer ? placeAt(scene.layers, layer, index) : scene.layers;
  return layers === scene.layers ? scene : { ...scene, layers };
};

/* ---- Formes d'un calque ---- */

/**
 * Ajoute une forme au calque et la rend active.
 *
 * La nouvelle forme reprend le remplissage, la couleur et l'épaisseur de la
 * forme active — dessiner dix formes pleines d'affilée ne doit pas demander de
 * cocher dix fois. Sans forme active, couleur et épaisseur viennent du style
 * courant (`scene.style`, réglé depuis la carte du trait), le remplissage de
 * la dernière forme du calque. La forme créée devient le style courant.
 */
export const addElement = (scene, layerId, type, x, y, overrides = {}) => {
  const active = getActiveElement(scene);
  const previous = active ?? scene.layers.find((layer) => layer.id === layerId)?.elements.at(-1);
  const style = {
    ...(previous && { filled: previous.filled, stroke: previous.stroke, strokeWidth: previous.strokeWidth }),
    ...(!active && scene.style),
  };
  /* Un calque passé en 3D, même éteint, donne sa profondeur aux nouvelles formes. */
  const planar = scene.layers.find((layer) => layer.id === layerId)?.plane;
  const element = createElement(type, x, y, { ...style, ...(planar && { height: DEFAULT_DEPTH }), ...overrides });
  return {
    ...mapLayer(scene, layerId, (layer) => ({ ...layer, elements: [...layer.elements, element] })),
    activeElementId: element.id,
    style: { stroke: element.stroke, strokeWidth: element.strokeWidth },
  };
};

/**
 * Couleur et épaisseur affichées par la carte du trait : celles de la forme
 * active, sinon le style courant, à défaut la dernière forme du calque actif.
 *
 * ponytail: `scene.style` n'est pas sauvegardé — après rechargement on
 * retombe sur la dernière forme du calque. Le sérialiser (format @21) si ça gêne.
 */
export const currentStyle = (scene) => {
  const source = getActiveElement(scene) ?? { ...getActiveLayer(scene)?.elements.at(-1), ...scene.style };
  return {
    stroke: source.stroke ?? DEFAULT_STROKE,
    strokeWidth: source.strokeWidth ?? DEFAULT_STROKE_WIDTH,
  };
};

/**
 * Règle couleur et/ou épaisseur : sur la forme active s'il y en a une, et
 * toujours sur le style courant, repris par les formes suivantes. Sans forme
 * active, `layers` ne change pas : le réglage n'entre pas dans l'historique,
 * comme une sélection.
 */
export const setStyle = (scene, patch) => {
  const next = { ...scene, style: { ...currentStyle(scene), ...patch } };
  /* Toute la sélection prend la valeur : plusieurs formes réaccordées d'un geste. */
  return selectedIds(scene).reduce((current, id) => updateElement(current, id, patch), next);
};

/** Couleur / épaisseur qui diffèrent d'une forme sélectionnée à l'autre (la carte affiche « multi »). */
export const mixedStyle = (scene) => {
  const elements = scene.layers.flatMap((layer) => layer.elements);
  const selected = selectedIds(scene).map((id) => elements.find((element) => element.id === id));
  const differs = (key) => selected.some((element) => element[key] !== selected[0][key]);
  return { stroke: differs('stroke'), strokeWidth: differs('strokeWidth') };
};

/**
 * Ajoute des tracés donnés en coordonnées absolues, en une seule transition :
 * un chemin collé à dix sous-tracés s'annule d'un seul geste.
 */
export const addTraces = (scene, layerId, traces) =>
  traces.reduce((current, { points, closed }) => {
    const { x, y, points: relative } = centerPoints(points);
    return addElement(current, layerId, 'polyline', x, y, { points: relative, closed });
  }, scene);

/**
 * Recalcule le centre d'un tracé sans le déplacer à l'écran. Le décalage est
 * mesuré dans le repère de la forme, donc tourné avant de déplacer `x, y`.
 */
export const recenterTrace = (scene, elementId) => {
  const element = scene.layers.flatMap((layer) => layer.elements).find((el) => el.id === elementId);
  if (!element?.points?.length) return scene;
  const { x, y, points } = centerPoints(element.points);
  if (x === 0 && y === 0) return scene;
  const offset = rotateVector({ x, y }, element.rotation ?? 0);
  return updateElement(scene, elementId, { x: element.x + offset.x, y: element.y + offset.y, points });
};

export const setActiveElement = (scene, elementId) => ({ ...scene, activeElementId: elementId });

/**
 * Formes sélectionnées, toutes du calque de la forme active. `scene.selection`
 * (état d'écran, non sauvegardé) ne compte que s'il contient la forme active :
 * une transition qui active une autre forme sans le connaître ramène la
 * sélection à elle seule, et une forme supprimée en sort d'elle-même.
 */
export const selectedIds = (scene) => {
  const layer = scene.activeElementId && layerOfElement(scene, scene.activeElementId);
  if (!layer) return [];
  const ids = scene.selection?.includes(scene.activeElementId) ? scene.selection : [scene.activeElementId];
  return ids.filter((id) => layer.elements.some((element) => element.id === id));
};

/** Sélectionne `ids` dans le calque de la dernière, qui devient la forme active. */
export const selectElements = (scene, ids) => {
  const layer = ids.length > 0 ? layerOfElement(scene, ids.at(-1)) : null;
  if (!layer) return { ...scene, activeElementId: null, selection: [] };
  const selection = [...new Set(ids)].filter((id) => layer.elements.some((element) => element.id === id));
  return { ...scene, activeLayerId: layer.id, activeElementId: selection.at(-1), selection };
};

/** Maj+clic : ajoute ou retire une forme ; d'un autre calque, elle est sélectionnée seule. */
export const toggleSelected = (scene, elementId) => {
  const current = selectedIds(scene);
  if (current.includes(elementId)) return selectElements(scene, current.filter((id) => id !== elementId));
  const sameLayer = current.length > 0 && layerOfElement(scene, elementId) === layerOfElement(scene, current[0]);
  return selectElements(scene, sameLayer ? [...current, elementId] : [elementId]);
};

/**
 * Maj+clic dans l'arbre : ajoute à la sélection les formes entre la forme active
 * (l'ancre, qui reste active) et `elementId` ; d'un autre calque, elle est sélectionnée seule.
 */
export const selectRange = (scene, elementId) => {
  const current = selectedIds(scene);
  const layer = layerOfElement(scene, elementId);
  if (!layer || current.length === 0 || layerOfElement(scene, current[0]) !== layer) return selectElements(scene, [elementId]);
  const ids = layer.elements.map((element) => element.id);
  const [from, to] = [ids.indexOf(scene.activeElementId), ids.indexOf(elementId)].sort((a, b) => a - b);
  const others = [...current, ...ids.slice(from, to + 1)].filter((id) => id !== scene.activeElementId);
  return selectElements(scene, [...others, scene.activeElementId]);
};

export const translateElements = (scene, ids, dx, dy) =>
  ids.reduce((current, id) => {
    const element = current.layers.flatMap((layer) => layer.elements).find((el) => el.id === id);
    return element ? updateElement(current, id, { x: element.x + dx, y: element.y + dy }) : current;
  }, scene);

/** Les identifiants de forme sont uniques dans la scène : le calque est retrouvé. */
const mapElement = (scene, elementId, fn) => ({
  ...scene,
  layers: scene.layers.map((layer) =>
    layer.elements.some((element) => element.id === elementId)
      ? { ...layer, elements: fn(layer.elements) }
      : layer,
  ),
});

/* Une forme ouverte (tracé ou arc) quitte les booléens qui l'employaient. */
export const updateElement = (scene, elementId, patch) =>
  mapElement(scene, elementId, (elements) => {
    const next = elements.map((element) => (element.id === elementId ? { ...element, ...patch } : element));
    const element = next.find((el) => el.id === elementId);
    if (!element || isClosedShape(element)) return next;
    return withoutTool(next, elementId).map((el) => (el.id === elementId ? { ...el, booleans: [] } : el));
  });

/* Les formes qui employaient `toolId` comme outil booléen le perdent. */
const withoutTool = (elements, toolId) =>
  elements.map((element) =>
    element.booleans.some((step) => step.with === toolId)
      ? { ...element, booleans: element.booleans.filter((step) => step.with !== toolId) }
      : element,
  );

export const removeElement = (scene, elementId) => {
  /* Un outil supprimé libère les formes qu'il travaillait. */
  const next = mapElement(scene, elementId, (elements) =>
    withoutTool(elements.filter((element) => element.id !== elementId), elementId),
  );
  if (scene.activeElementId !== elementId) return next;
  const layer = next.layers.find((candidate) => candidate.id === scene.activeLayerId);
  return { ...next, activeElementId: layer?.elements.at(-1)?.id ?? null };
};

export const removeElements = (scene, ids) => ids.reduce(removeElement, scene);

/* ---- Pile booléenne d'une forme ---- */

/* Sans intérieur — point, ligne, tracé ou arc ouverts — une forme ne reçoit
   pas de booléen et n'en est pas l'outil. */
export const isClosedShape = (element) =>
  element.type !== 'point' &&
  element.type !== 'line' &&
  !(element.type === 'polyline' && !element.closed) &&
  !(element.type === 'arc' && element.closure === 'open');

const mapBooleans = (scene, elementId, fn) =>
  mapElement(scene, elementId, (elements) =>
    elements.map((element) => (element.id === elementId ? { ...element, booleans: fn(element.booleans) } : element)),
  );

/**
 * `toolId` comme outil de `elementId` fermerait-il une boucle ? Oui si l'outil
 * mène déjà à la forme par ses propres outils : un outil n'étant pas dessiné,
 * toute la boucle disparaîtrait.
 */
export const closesLoop = (layer, elementId, toolId) => {
  const byId = new Map(layer.elements.map((el) => [el.id, el]));
  const seen = new Set();
  const pending = [toolId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === elementId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(byId.get(id)?.booleans ?? []).map((step) => step.with));
  }
  return false;
};

const layerOfElement = (scene, elementId) =>
  scene.layers.find((candidate) => candidate.elements.some((el) => el.id === elementId));

/**
 * Ajoute une opération, outil = la première autre forme du calque pas encore
 * employée (ou, toutes l'étant, la première autre), hors celles qui
 * fermeraient une boucle. Sans outil possible, rien.
 */
export const addBoolean = (scene, elementId) => {
  const layer = layerOfElement(scene, elementId);
  const element = layer?.elements.find((el) => el.id === elementId);
  if (!element || !isClosedShape(element)) return scene;
  const others = layer.elements.filter(
    (el) => el.id !== elementId && isClosedShape(el) && !closesLoop(layer, elementId, el.id),
  );
  const used = new Set(element.booleans.map((step) => step.with));
  const tool = others.find((el) => !used.has(el.id)) ?? others[0];
  if (!tool) return scene;
  return mapBooleans(scene, elementId, (steps) => [...steps, { with: tool.id, op: DEFAULT_BOOLEAN_OP }]);
};

export const updateBoolean = (scene, elementId, index, patch) => {
  const layer = layerOfElement(scene, elementId);
  const tool = layer?.elements.find((el) => el.id === patch.with);
  if (patch.with !== undefined && (!tool || !isClosedShape(tool) || closesLoop(layer, elementId, patch.with))) return scene;
  return mapBooleans(scene, elementId, (steps) => steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
};

export const removeBoolean = (scene, elementId, index) =>
  mapBooleans(scene, elementId, (steps) => steps.filter((_, i) => i !== index));

/* Outil d'un booléen du calque : jamais dessiné, seule sa géométrie compte. */
export const isBooleanTool = (layer, element) =>
  layer.elements.some((other) => other.booleans.some((step) => step.with === element.id));

/**
 * Chaque forme de `ids` reçoit une copie posée juste devant elle, décalée de
 * `offset` pour qu'on la voie, et les copies deviennent la sélection. Un outil
 * booléen copié avec le groupe est remplacé par sa copie, comme
 * dans `duplicateLayer` ; hors du groupe, la copie garde celui de l'originale.
 */
export const duplicateElements = (scene, ids, offset) => {
  const copies = new Map(
    scene.layers.flatMap((layer) => layer.elements).filter((el) => ids.includes(el.id)).map((el) => [el.id, nextId('E')]),
  );
  if (copies.size === 0) return scene;
  const copyOf = (element) => ({
    ...element,
    id: copies.get(element.id),
    x: element.x + offset,
    y: element.y + offset,
    interpolations: element.interpolations.map((interpolation) => ({ ...interpolation, id: nextId('I') })),
    booleans: element.booleans.map((step) => ({ ...step, with: copies.get(step.with) ?? step.with })),
  });
  const layers = scene.layers.map((layer) =>
    layer.elements.some((element) => copies.has(element.id))
      ? { ...layer, elements: layer.elements.flatMap((element) => (copies.has(element.id) ? [element, copyOf(element)] : [element])) }
      : layer,
  );
  return selectElements({ ...scene, layers }, [...copies.values()]);
};

export const duplicateElement = (scene, elementId, offset) => duplicateElements(scene, [elementId], offset);

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

/**
 * Pose une forme au rang `index` du calque `layerId` (0 = fond), le sien ou un
 * autre. Un booléen ne vit qu'entre formes d'un même calque : changer de
 * calque les rompt, dans les deux sens. La forme active emmène le calque actif.
 */
export const placeElement = (scene, elementId, layerId, index) => {
  const source = scene.layers.find((layer) => layer.elements.some((element) => element.id === elementId));
  const target = scene.layers.find((layer) => layer.id === layerId);
  if (!source || !target) return scene;
  const element = source.elements.find((candidate) => candidate.id === elementId);
  if (source === target) {
    const elements = placeAt(source.elements, element, index);
    return elements === source.elements ? scene : mapLayer(scene, layerId, (layer) => ({ ...layer, elements }));
  }
  const moved = element.booleans.length > 0 ? { ...element, booleans: [] } : element;
  const layers = scene.layers.map((layer) => {
    if (layer === source) {
      return { ...layer, elements: withoutTool(layer.elements.filter((candidate) => candidate !== element), elementId) };
    }
    if (layer !== target) return layer;
    const at = Math.max(0, Math.min(index, layer.elements.length));
    return { ...layer, elements: [...layer.elements.slice(0, at), moved, ...layer.elements.slice(at)] };
  });
  const activeLayerId = scene.activeElementId === elementId ? layerId : scene.activeLayerId;
  return { ...scene, layers, activeLayerId };
};

/* ---- Pile de modificateurs ---- */

/**
 * Calque ou forme d'id `id` : tous deux portent une pile de modificateurs et
 * une pile d'interpolations, et les transitions de pile valent pour l'un comme
 * pour l'autre.
 */
const mapOwner = (scene, id, fn) =>
  scene.layers.some((layer) => layer.id === id)
    ? mapLayer(scene, id, fn)
    : {
        ...scene,
        layers: scene.layers.map((layer) =>
          layer.elements.some((element) => element.id === id)
            ? { ...layer, elements: layer.elements.map((element) => (element.id === id ? fn(element) : element)) }
            : layer,
        ),
      };

export const addModifier = (scene, id) =>
  mapOwner(scene, id, (owner) => ({ ...owner, modifiers: [...owner.modifiers, createModifier()] }));

/**
 * Une liaison d'interpolation désigne un rang dans la pile de modificateurs de
 * son propriétaire (calque ou forme) : remuer la pile doit l'emmener, sinon l'opacité passerait en silence
 * à l'étage du voisin.
 */
const remapBindings = (owner, fn) => ({
  ...owner,
  interpolations: owner.interpolations.map((interpolation) =>
    interpolation.binding === null
      ? interpolation
      : { ...interpolation, binding: fn(interpolation.binding) },
  ),
});

export const removeModifier = (scene, id, index) =>
  mapOwner(scene, id, (owner) =>
    remapBindings(
      { ...owner, modifiers: owner.modifiers.filter((_, i) => i !== index) },
      /* L'étage supprimé emporte sa liaison ; ceux du dessus reculent d'un rang. */
      (rank) => (rank === index ? null : rank > index ? rank - 1 : rank),
    ),
  );

/** `delta` = -1 vers le début de la pile, +1 vers la fin. L'ordre change le dessin. */
export const moveModifier = (scene, id, index, delta) =>
  mapOwner(scene, id, (owner) => {
    const to = index + delta;
    if (to < 0 || to >= owner.modifiers.length) return owner;
    const modifiers = [...owner.modifiers];
    [modifiers[index], modifiers[to]] = [modifiers[to], modifiers[index]];
    return remapBindings({ ...owner, modifiers }, (rank) =>
      rank === index ? to : rank === to ? index : rank,
    );
  });

export const updateModifier = (scene, id, index, patch) =>
  mapOwner(scene, id, (owner) => ({
    ...owner,
    modifiers: owner.modifiers.map((current, i) => {
      if (i !== index) return current;
      /* `center: null` rend l'étage au pivot du calque : la clé disparaît.
         Changer de type rend l'axe par défaut du nouveau miroir. */
      const { center, axis, ...modifier } = { ...current, ...patch };
      const keepAxis = Number.isFinite(axis) && modifier.type === current.type;
      return {
        ...modifier,
        n: clampCount(modifier.n),
        ...(center ? { center } : {}),
        ...(keepAxis ? { axis: clampAxis(axis) } : {}),
        ...('radiusStep' in modifier ? { radiusStep: clampGrowth(modifier.radiusStep) } : {}),
      };
    }),
  }));

/* ---- Pile d'interpolations ---- */

const mapInterpolation = (scene, ownerId, id, fn) =>
  mapOwner(scene, ownerId, (owner) => ({
    ...owner,
    interpolations: owner.interpolations.map((interpolation) =>
      interpolation.id === id ? fn(interpolation) : interpolation,
    ),
  }));

export const addInterpolation = (scene, ownerId) =>
  mapOwner(scene, ownerId, (owner) => ({
    ...owner,
    interpolations: [...owner.interpolations, createInterpolation()],
  }));

export const removeInterpolation = (scene, ownerId, id) =>
  mapOwner(scene, ownerId, (owner) => ({
    ...owner,
    interpolations: owner.interpolations.filter((interpolation) => interpolation.id !== id),
  }));

/** Vide la pile : le calque ou la forme rend à nouveau toutes ses copies pareilles. */
export const clearInterpolations = (scene, ownerId) =>
  mapOwner(scene, ownerId, (owner) => ({ ...owner, interpolations: [] }));

/**
 * `patch` porte les champs à changer : `property`, `binding`, `curve`, `seed` ou `range`.
 *
 * Changer de propriété change les bornes, donc la plage repart du réglage par
 * défaut de la nouvelle plutôt que d'être rabotée à une valeur qui ne veut plus
 * rien dire — une échelle de 3 ramenée à une opacité de 1.
 */
export const updateInterpolation = (scene, ownerId, id, patch) =>
  mapInterpolation(scene, ownerId, id, (interpolation) => {
    const next = { ...interpolation, ...patch };
    if (next.property === interpolation.property) return next;
    return { ...next, range: [...RANGE_BOUNDS[next.property].defaultRange] };
  });

/** `index` = 0 pour la borne de début, 1 pour celle de fin. */
export const updateInterpolationRange = (scene, ownerId, id, index, value) =>
  mapInterpolation(scene, ownerId, id, (interpolation) => {
    const range = [...interpolation.range];
    /* Mêmes bornes que l'import : la valeur saisie survit au rechargement. */
    const { min, max, color } = RANGE_BOUNDS[interpolation.property];
    range[index] = color ? value : clamp(value, min, max);
    return { ...interpolation, range };
  });
