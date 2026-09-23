import { applyStack, createModifier, effectiveCount, stackCopies } from './modifiers.js';
import { clampCount, stackValues, t } from './interpolate.js';

export const STAGE = { width: 900, height: 900 };

/** Ramène un point au croisement le plus proche d'une grille de `divisions` cases par côté. */
export const snapToGrid = ({ x, y }, divisions) => {
  const cellX = STAGE.width / divisions;
  const cellY = STAGE.height / divisions;
  return { x: Math.round(x / cellX) * cellX, y: Math.round(y / cellY) * cellY };
};

/** Grille ronde : centrée sur le plan, le dernier cercle touche ses bords, le premier rayon pointe vers le haut. */
export const POLAR_GRID = {
  center: { x: STAGE.width / 2, y: STAGE.height / 2 },
  radius: Math.min(STAGE.width, STAGE.height) / 2,
};

/**
 * Ramène un point au croisement le plus proche de `circles` cercles
 * équidistants et `divisions` rayons. Au-delà du dernier cercle, on s'y tient.
 */
export const snapToPolarGrid = ({ x, y }, circles, divisions) => {
  const { center, radius } = POLAR_GRID;
  const ring = radius / circles;
  const sector = (2 * Math.PI) / divisions;
  const r = Math.min(circles, Math.round(Math.hypot(x - center.x, y - center.y) / ring)) * ring;
  /* Angle compté depuis le haut, dans le sens horaire (y descend à l'écran). */
  const angle = Math.round(Math.atan2(x - center.x, center.y - y) / sector) * sector;
  return { x: center.x + r * Math.sin(angle), y: center.y - r * Math.cos(angle) };
};

/**
 * Bornes des propriétés interpolables — source unique.
 *
 * `identity` est la valeur neutre : celle d'un calque neuf, et celle sur
 * laquelle un fichier importé se replie quand la plage est absente. La faire
 * dériver de `max` donnait silencieusement `scale = 10` à l'import.
 */
export const RANGE_BOUNDS = {
  opacity: { min: 0, max: 1, step: 0.01, identity: 1, defaultRange: [1, 0] },
  scale: { min: 0, max: 3, step: 0.01, identity: 1, defaultRange: [1, 0.4] },
};

export const RANGE_LABELS = { opacity: 'Opacité', scale: 'Échelle' };

/**
 * Formes disponibles.
 *
 * `geometry` est le nœud SVG émis. « dot » n'est pas un cercle : c'est un trait
 * de longueur nulle à bout rond, donc sans taille propre — son diamètre est
 * l'épaisseur du calque, et sa couleur celle du calque.
 *
 * `filled` ne dit que rempli ou non : la couleur, elle, vient du calque.
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
    defaults: { rx: 60, ry: 60, filled: false },
  },
  /* Portion du cercle de rayon `rx`, de `start` à `end` en degrés — 0 en haut,
     sens horaire, comme le premier sommet du polygone. `closure` choisit ce
     qu'on voit de la même paire d'angles : l'arc nu, la corde ou le secteur.
     Défaut : un demi-disque, pour qu'un geste seul pose un arc lisible. */
  arc: {
    label: 'Arc',
    geometry: 'arc',
    uniform: true,
    defaults: { rx: 60, ry: 60, start: 0, end: 180, closure: 'sector', filled: false },
  },
  /* Un cercle qui cesse d'être uniforme : même nœud à deux rayons. */
  ellipse: {
    label: 'Ellipse',
    geometry: 'ellipse',
    uniform: false,
    defaults: { rx: 80, ry: 45, filled: false },
  },
  /* `sides` sommets sur le cercle de rayon `rx`, le premier en haut. `inner`
     place un sommet creux entre deux sommets, en % de la distance du centre au
     milieu d'un côté : à 100 il tombe sur le côté et le polygone reste convexe,
     en deçà il se creuse en étoile. */
  polygon: {
    label: 'Polygone',
    geometry: 'polygon',
    uniform: true,
    defaults: { rx: 60, ry: 60, sides: 6, inner: 100, filled: false },
  },
  /* Sommets libres, relatifs au centre `x, y` : le tracé bouge, se met à
     l'échelle et suit les modificateurs d'un bloc, comme les autres formes.
     Défaut : un triangle, pour qu'un ajout sans geste montre quelque chose. */
  polyline: {
    label: 'Tracé',
    geometry: 'polyline',
    uniform: false,
    defaults: {
      rx: 0,
      ry: 0,
      points: [
        { x: 0, y: -50 },
        { x: 43.3, y: 25 },
        { x: -43.3, y: 25 },
      ],
      closed: true,
      filled: false,
    },
  },
  point: {
    label: 'Point',
    geometry: 'dot',
    uniform: true,
    defaults: { rx: 0, ry: 0, filled: false },
  },
  rect: {
    label: 'Rectangle',
    geometry: 'rect',
    uniform: false,
    defaults: { rx: 70, ry: 45, filled: false },
  },
  line: {
    label: 'Ligne',
    geometry: 'line',
    uniform: false,
    signed: true,
    /* Sans contour, une ligne n'a rien à montrer : le remplissage ne la peint pas. */
    defaults: { rx: 60, ry: 0, filled: false },
  },
};

export const DEFAULT_SHAPE = 'circle';

/* Au-delà, un polygone ne se distingue plus d'un cercle. */
export const MAX_SIDES = 64;

export const clampSides = (value) =>
  Math.min(MAX_SIDES, Math.max(3, Math.round(Number.isFinite(value) ? value : 6)));

export const ARC_CLOSURES = { open: 'Ouvert', chord: 'Corde', sector: 'Secteur' };

/* Un tour dans chaque sens : `end - start` suffit à dire l'étendue, au-delà le
   même dessin sous un nombre sans borne. */
export const clampAngle = (value, fallback = 0) =>
  Math.min(360, Math.max(-360, Number.isFinite(value) ? value : fallback));

/* Borne d'import : un tracé collé au-delà est plus probablement une erreur de
   copie qu'un dessin. */
export const MAX_POINTS = 5000;

/**
 * Centre d'une liste de sommets absolus : celui de leur boîte englobante, et
 * les sommets rapportés à lui. C'est ce centre que l'échelle et les
 * modificateurs prennent pour pivot.
 */
export const centerPoints = (absolute) => {
  const xs = absolute.map((p) => p.x);
  const ys = absolute.map((p) => p.y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { x, y, points: absolute.map((p) => ({ x: p.x - x, y: p.y - y })) };
};

/** Tourne un vecteur de `degrees` : le repère d'une forme vers celui de l'écran. */
export const rotateVector = ({ x, y }, degrees) => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
};

/* Sommets dans le repère de la forme, sans sa rotation : c'est dans ce repère
   que le tracé se dessine et se recentre. */
export const absolutePoints = (element) =>
  element.points.map((p) => ({ x: element.x + p.x, y: element.y + p.y }));

/** `inner` en % : 100 = polygone convexe, 0 = étoile réduite à ses rayons. */
export const clampInner = (value) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 100));

/**
 * L'épaisseur du trait appartient au calque, pas à la forme : un calque est un
 * coup de crayon, toutes ses formes sortent du même outil. C'est aussi ce qui
 * donne son diamètre au point, faute d'étendue propre.
 */
export const DEFAULT_STROKE_WIDTH = 1.5;

/**
 * La couleur appartient au calque pour la même raison que l'épaisseur : un
 * calque est un coup de crayon, toutes ses formes sortent du même outil. Le
 * remplissage n'a pas de teinte propre — rempli, une forme se peint de son
 * contour.
 */
export const DEFAULT_STROKE = '#7dd3c0';

/**
 * Le style de trait appartient à la forme, pas au calque : un même calque peut
 * mêler un anneau pointillé et un cercle plein. Le motif de tirets est exprimé
 * en multiples de l'épaisseur du calque : un pointillé reste un pointillé quand
 * on épaissit le trait. Tableau vide = trait plein.
 */
export const LINECAPS = { butt: 'Net', round: 'Rond', square: 'Carré' };
export const DEFAULT_LINECAP = 'butt';
/* Un point est un tiret de longueur nulle : sans bout rond, il ne se voit pas. */
export const DASH_PRESETS = {
  solid: { label: 'Plein', dash: [] },
  dashed: { label: 'Tirets', dash: [4, 2] },
  dotted: { label: 'Points', dash: [0, 2], linecap: 'round' },
};
const MAX_DASH_LENGTH = 16;
const MAX_DASH_VALUE = 100;

export const clampDash = (values) => {
  if (!Array.isArray(values)) return [];
  const dash = values
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, MAX_DASH_LENGTH)
    .map((value) => Math.min(MAX_DASH_VALUE, Math.max(0, value)));
  /* Que des zéros : SVG trace plein, autant le dire. */
  return dash.some((value) => value > 0) ? dash : [];
};

/** Saisie libre : nombres séparés par des espaces ou des virgules. */
export const parseDash = (text) => clampDash(String(text).split(/[\s,]+/).filter(Boolean));

export const clampLinecap = (value) => (Object.hasOwn(LINECAPS, value) ? value : DEFAULT_LINECAP);

const counters = { L: 0, E: 0, I: 0 };
const nextId = (prefix) => `${prefix}${++counters[prefix]}`;

/* `rotation` en degrés, autour du centre `x, y` : l'angle appartient à la
   forme, deux formes d'un même dessin s'inclinent rarement pareil. */
export const createElement = (type, x, y, overrides = {}) => ({
  id: nextId('E'),
  rotation: 0,
  dash: [],
  linecap: DEFAULT_LINECAP,
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
  stroke: DEFAULT_STROKE,
  elements: [],
  /* Pile vide : le calque se rend tel quel. On empile ensuite les gestes. */
  modifiers: [],
  /* Pile vide : toutes les copies se rendent pareilles. */
  interpolations: [],
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
 */
export const createInterpolation = (overrides = {}) => ({
  id: nextId('I'),
  property: 'opacity',
  range: [...RANGE_BOUNDS.opacity.defaultRange],
  binding: null,
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
    for (const interpolation of layer.interpolations) take(interpolation.id);
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
 * Empiler multiplie : deux modificateurs de 5 et 2 copies en font 10. Une rampe
 * d'interpolation court par défaut sur ce total, pas sur chaque modificateur —
 * sinon deux copies voisines de la pile intérieure auraient la même opacité.
 * Elle se lie au besoin à un seul étage, et plusieurs interpolations peuvent
 * viser le calque : leurs valeurs se composent par produit.
 *
 * Le résultat est groupé par copie, ce qui fixe aussi l'ordre de dessin à
 * l'intérieur du calque.
 *
 * ponytail: pas de mémoïsation. Il n'y a pas de boucle de rendu — le renderer
 * n'est rappelé que sur notification du store. Mesurer avant d'en ajouter.
 */

/**
 * Facteur de rampe d'une interpolation pour la copie `i` de la pile.
 *
 * Liée à un modificateur, l'interpolation ne lit que l'indice de cet étage :
 * deux copies qui n'en diffèrent pas partagent la même valeur. Une liaison qui
 * ne désigne plus de modificateur — fichier importé, étage supprimé ailleurs —
 * retombe sur la rampe globale plutôt que de rendre `NaN`.
 */
const rangeFactor = (layer, binding, indices, i, total) => {
  const modifier = binding === null ? null : layer.modifiers[binding];
  return modifier ? t(indices[binding], effectiveCount(modifier)) : t(i, total);
};

export const getRenderedChildren = (layer) => {
  if (layer.elements.length === 0) return [];
  const copies = stackCopies(layer.modifiers);

  const children = [];
  copies.forEach((indices, i) => {
    const properties = stackValues(layer.interpolations, (interpolation) =>
      rangeFactor(layer, interpolation.binding, indices, i, copies.length),
    );
    for (const element of layer.elements) {
      const { x, y, angle, flip } = applyStack(element, layer.modifiers, indices, layer.center);
      /* Orientation de la copie puis rotation propre : `R(a)·S·R(r) = R(a − r)·S`,
         le reflet inverse le sens de l'angle propre. */
      const own = element.rotation ?? 0;
      children.push({
        ...element,
        strokeWidth: layer.strokeWidth,
        stroke: layer.stroke,
        fill: element.filled ? layer.stroke : 'none',
        x,
        y,
        rotation: (angle * 180) / Math.PI + (flip ? -own : own),
        flip,
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

export const setLayerStroke = (scene, id, stroke) =>
  mapLayer(scene, id, (layer) => ({ ...layer, stroke }));

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
 * La nouvelle forme reprend le remplissage de la forme active, quel que soit
 * son type — dessiner dix formes pleines d'affilée ne doit pas demander de
 * cocher dix fois. La couleur et l'épaisseur n'en font pas partie : elles
 * vivent sur le calque.
 */
export const addElement = (scene, layerId, type, x, y, overrides = {}) => {
  const previous = getActiveElement(scene);
  const style = previous ? { filled: previous.filled } : {};
  const element = createElement(type, x, y, { ...style, ...overrides });
  return {
    ...mapLayer(scene, layerId, (layer) => ({ ...layer, elements: [...layer.elements, element] })),
    activeElementId: element.id,
  };
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

/** Copie posée juste devant l'originale, décalée de `offset` pour qu'on la voie. */
export const duplicateElement = (scene, elementId, offset) => {
  const source = scene.layers.flatMap((layer) => layer.elements).find((el) => el.id === elementId);
  if (!source) return scene;
  const copy = { ...source, id: nextId('E'), x: source.x + offset, y: source.y + offset };
  return {
    ...mapElement(scene, elementId, (elements) =>
      elements.flatMap((element) => (element.id === elementId ? [element, copy] : [element])),
    ),
    activeElementId: copy.id,
  };
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

/**
 * Une liaison d'interpolation désigne un rang dans la pile de modificateurs du
 * calque : remuer la pile doit l'emmener, sinon l'opacité passerait en silence
 * à l'étage du voisin.
 */
const remapBindings = (layer, fn) => ({
  ...layer,
  interpolations: layer.interpolations.map((interpolation) =>
    interpolation.binding === null
      ? interpolation
      : { ...interpolation, binding: fn(interpolation.binding) },
  ),
});

export const removeModifier = (scene, id, index) =>
  mapLayer(scene, id, (layer) =>
    remapBindings(
      { ...layer, modifiers: layer.modifiers.filter((_, i) => i !== index) },
      /* L'étage supprimé emporte sa liaison ; ceux du dessus reculent d'un rang. */
      (rank) => (rank === index ? null : rank > index ? rank - 1 : rank),
    ),
  );

/** `delta` = -1 vers le début de la pile, +1 vers la fin. L'ordre change le dessin. */
export const moveModifier = (scene, id, index, delta) =>
  mapLayer(scene, id, (layer) => {
    const to = index + delta;
    if (to < 0 || to >= layer.modifiers.length) return layer;
    const modifiers = [...layer.modifiers];
    [modifiers[index], modifiers[to]] = [modifiers[to], modifiers[index]];
    return remapBindings({ ...layer, modifiers }, (rank) =>
      rank === index ? to : rank === to ? index : rank,
    );
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

/* ---- Pile d'interpolations ---- */

const mapInterpolation = (scene, layerId, id, fn) =>
  mapLayer(scene, layerId, (layer) => ({
    ...layer,
    interpolations: layer.interpolations.map((interpolation) =>
      interpolation.id === id ? fn(interpolation) : interpolation,
    ),
  }));

export const addInterpolation = (scene, layerId) =>
  mapLayer(scene, layerId, (layer) => ({
    ...layer,
    interpolations: [...layer.interpolations, createInterpolation()],
  }));

export const removeInterpolation = (scene, layerId, id) =>
  mapLayer(scene, layerId, (layer) => ({
    ...layer,
    interpolations: layer.interpolations.filter((interpolation) => interpolation.id !== id),
  }));

/** Vide la pile : le calque rend à nouveau toutes ses copies pareilles. */
export const clearInterpolations = (scene, layerId) =>
  mapLayer(scene, layerId, (layer) => ({ ...layer, interpolations: [] }));

/**
 * `patch` porte les champs à changer : `property`, `binding` ou `range`.
 *
 * Changer de propriété change les bornes, donc la plage repart du réglage par
 * défaut de la nouvelle plutôt que d'être rabotée à une valeur qui ne veut plus
 * rien dire — une échelle de 3 ramenée à une opacité de 1.
 */
export const updateInterpolation = (scene, layerId, id, patch) =>
  mapInterpolation(scene, layerId, id, (interpolation) => {
    const next = { ...interpolation, ...patch };
    if (next.property === interpolation.property) return next;
    return { ...next, range: [...RANGE_BOUNDS[next.property].defaultRange] };
  });

/** `index` = 0 pour la borne de début, 1 pour celle de fin. */
export const updateInterpolationRange = (scene, layerId, id, index, value) =>
  mapInterpolation(scene, layerId, id, (interpolation) => {
    const range = [...interpolation.range];
    range[index] = value;
    return { ...interpolation, range };
  });
