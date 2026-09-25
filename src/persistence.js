import { clampAxis, clampGrowth, createModifier, MODIFIERS } from './modifiers.js';
import { clampCount, CURVES } from './interpolate.js';
import {
  ARC_CLOSURES,
  clampAngle,
  clampBooleanOp,
  closesLoop,
  clampDash,
  clampExtent,
  clampGap,
  clampLinecap,
  clampInner,
  clampSides,
  createElement,
  MAX_POINTS,
  createInterpolation,
  createLayer,
  DEFAULT_STROKE,
  DEFAULT_OUTLINE_GAP,
  DEFAULT_STROKE_WIDTH,
  clampHeading,
  clampHeight,
  clampPlaneSides,
  clampTilt,
  DEFAULT_PLANE,
  insideHosts,
  isHexColor,
  RANGE_BOUNDS,
  reserveIds,
  MAX_NAME_LENGTH,
  SHAPES,
  STAGE,
} from './scene.js';

/* La clé ne suit pas la version du format : la changer orphelinerait
   l'autosave déjà posée chez les utilisateurs, alors que `deserialize` sait
   relire les anciens formats. Même raison pour le préfixe `illu` : c'est
   l'ancien nom de Vektor. */
const STORAGE_KEY = 'illu:scene:v1';
export const FORMAT = 'vektor/scene@30';

/* Les formats antérieurs restent lisibles :
   - `@1` décrivait la forme par un `radius` unique, avant le rectangle ;
   - `@1` et `@2` n'avaient qu'une forme par calque, dans `baseElement` ;
   - `@1` à `@3` portaient l'épaisseur sur chaque forme, pas sur le calque ;
   - `@1` à `@4` n'avaient qu'un modificateur par calque, dans `modifier` ;
   - `@1` à `@5` portaient la couleur sur chaque forme, pas sur le calque ;
   - `@1` à `@6` ignoraient les liaisons d'interpolation : leurs rampes sont
     globales, ce qui rend exactement le même dessin ;
   - `@1` à `@7` n'avaient qu'une interpolation par propriété et par calque,
     dans `propertyRanges` : chaque plage non neutre se relit comme un étage de
     la pile, ce qui rend exactement le même dessin ;
   - `@1` à `@8` ne connaissaient ni l'ellipse ni le polygone, `@1` à `@9`
     pas le tracé, `@1` à `@10` pas la rotation propre (formes droites), `@1` à
     `@11` pas l'arc : rien à convertir, ils se relisent tels quels ;
   - `@1` à `@12` n'orientaient pas les copies : leurs modificateurs se relisent
     case décochée, ce qui rend exactement le même dessin ;
   - `@1` à `@13` ne connaissaient pas le style de trait des formes : trait
     plein, bout net, ce qui rend exactement le même dessin ;
   - `@1` à `@14` n'interpolaient ni la rotation ni l'épaisseur : rien à
     convertir. Le bump empêche surtout une version antérieure de relire une
     vrille comme une opacité ;
   - `@1` à `@15` ne connaissaient pas les booléens : aucune forme n'a d'outil ;
   - `@1` à `@16` n'avaient qu'un pivot par calque : aucun modificateur n'a le
     sien, ce qui rend exactement le même dessin ;
   - `@1` à `@17` ne connaissaient que la rampe linéaire : c'est la courbe par
     défaut, ni les recoupements creux : option éteinte. Même dessin ;
   - `@1` à `@18` n'interpolaient pas la couleur : rien à convertir. Le bump
     empêche une version antérieure de relire un dégradé comme une opacité ;
   - `@4` à `@19` portaient couleur et épaisseur sur le calque : chaque forme
     reprend celles de son calque, même dessin ;
   - `@1` à `@20` n'inclinaient pas l'axe des miroirs : axe par défaut du
     type, même dessin. Le bump empêche une version antérieure de redresser
     un axe incliné sans le dire ;
   - `@1` à `@21` n'avaient pas de contour double : option éteinte, même dessin ;
   - `@1` à `@22` n'avaient ni plan 3D ni hauteur : calques à plat, même dessin ;
   - `@1` à `@23` ne reliaient pas les points : répétition linéaire éteinte,
     même dessin ;
   - `@1` à `@24` n'avaient de piles que sur le calque : formes sans pile
     propre, même dessin. Un point de `@24` relié le long des étages du calque
     redevient une suite de points — le lien suit désormais la pile du point ;
   - `@1` à `@25` ne lissaient pas les tracés reliés : lignes brisées, même dessin ;
   - `@1` à `@26` n'avaient ni courbe aléatoire, ni étirement, ni décalage des
     tirets : rien à convertir. Le bump empêche une version antérieure de
     relire un bruit comme une rampe linéaire ;
   - `@1` à `@27` ne nommaient pas les formes : libellé par défaut, même dessin ;
   - `@1` à `@28` n'espaçaient pas les spirales à pas d'arc constant : spirale
     croissante, même dessin ;
   - `@1` à `@29` ne connaissaient pas la spirale d'Archimède : rien à
     convertir. Le bump empêche une version antérieure de la relire en `none`. */
const READABLE_FORMATS = new Set([
  'illu/scene@1',
  'illu/scene@2',
  'illu/scene@3',
  'illu/scene@4',
  'illu/scene@5',
  'illu/scene@6',
  'illu/scene@7',
  'illu/scene@8',
  'illu/scene@9',
  'illu/scene@10',
  'illu/scene@11',
  'illu/scene@12',
  'illu/scene@13',
  'illu/scene@14',
  'illu/scene@15',
  'illu/scene@16',
  'vektor/scene@16',
  'vektor/scene@17',
  'vektor/scene@18',
  'vektor/scene@19',
  'vektor/scene@20',
  'vektor/scene@21',
  'vektor/scene@22',
  'vektor/scene@23',
  'vektor/scene@24',
  'vektor/scene@25',
  'vektor/scene@26',
  'vektor/scene@27',
  'vektor/scene@28',
  'vektor/scene@29',
  FORMAT,
]);

export const serialize = (scene) =>
  JSON.stringify(
    {
      format: FORMAT,
      layers: scene.layers,
      activeLayerId: scene.activeLayerId,
      activeElementId: scene.activeElementId,
    },
    null,
    2,
  );

/* ---- Validation ---- */

/* Un fichier importé est une donnée externe : chaque champ est vérifié et
   ramené dans ses bornes. Une forme inattendue lève, elle n'entre jamais à
   moitié dans le store. */

const fail = (message) => {
  throw new Error(message);
};

/* `Number(null)` et `Number('')` valent 0 : un champ vide ou nul se replie,
   il ne devient pas un trait invisible. */
const num = (value, fallback) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value))
    ? Number(value)
    : fallback;

const clamp = (value, { min, max, identity }) =>
  Math.min(max, Math.max(min, num(value, identity)));

/** Une plage absente ou partielle se replie sur la valeur neutre, jamais sur une borne. */
const readRange = (ranges, key) => {
  const bounds = RANGE_BOUNDS[key];
  const raw = Array.isArray(ranges?.[key]) ? ranges[key] : [];
  return [clamp(raw[0], bounds), clamp(raw[1], bounds)];
};

/**
 * Liaison d'interpolation : un rang dans la pile de modificateurs du calque.
 * Absente, hors bornes ou non entière, la propriété suit la rampe globale.
 */
const readBinding = (value, stackSize) => {
  /* `parseInt` plutôt que `Number` : `Number(null)` vaut 0, ce qui lierait à
     son insu la propriété au premier modificateur de la pile. */
  const rank = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isInteger(rank) && rank >= 0 && rank < stackSize ? rank : null;
};

/**
 * Interpolation d'un calque. Une propriété inconnue se replie sur l'opacité et
 * la plage est ramenée dans les bornes de cette propriété : un fichier importé
 * est une donnée externe, jamais une plage de confiance.
 */
const readInterpolation = (raw, stackSize) => {
  const property = Object.hasOwn(RANGE_BOUNDS, raw?.property) ? raw.property : 'opacity';
  const bounds = RANGE_BOUNDS[property];
  const range = Array.isArray(raw?.range) ? raw.range : [];
  /* Une couleur illisible ne se devine pas : la plage entière repart du défaut. */
  const colors = range.slice(0, 2);
  const read = bounds.color
    ? colors.length === 2 && colors.every(isHexColor) ? colors.map((value) => value.toLowerCase()) : [...bounds.defaultRange]
    : [clamp(range[0], bounds), clamp(range[1], bounds)];
  return createInterpolation({
    ...(typeof raw?.id === 'string' && raw.id !== '' ? { id: raw.id } : {}),
    property,
    range: read,
    binding: readBinding(raw?.binding, stackSize),
    curve: Object.hasOwn(CURVES, raw?.curve) ? raw.curve : 'linear',
    seed: Number.isInteger(raw?.seed) && raw.seed >= 0 && raw.seed < 2 ** 31 ? raw.seed : 0,
  });
};

/**
 * Pile d'interpolations du calque. Avant `@8` il n'en portait qu'une par
 * propriété, dans `propertyRanges` : chacune devient un étage de la pile.
 *
 * Une plage restée neutre n'en devient pas un — elle ne rendait rien, et la
 * faire apparaître encombrerait le panneau d'une ligne sans effet.
 */
const readInterpolations = (raw, stackSize) => {
  if (Array.isArray(raw.interpolations)) {
    return raw.interpolations.map((entry) => readInterpolation(entry, stackSize));
  }
  /* Avant `@8` n'existaient que des propriétés numériques. */
  const numeric = Object.keys(RANGE_BOUNDS).filter((property) => !RANGE_BOUNDS[property].color);
  return numeric.flatMap((property) => {
    const range = readRange(raw.propertyRanges, property);
    const { identity } = RANGE_BOUNDS[property];
    if (range[0] === identity && range[1] === identity) return [];
    return [
      createInterpolation({
        property,
        range,
        binding: readBinding(raw.rangeBindings?.[property], stackSize),
      }),
    ];
  });
};

/* Ancien point : un disque plein sans contour. Sa couleur de remplissage
   devient celle du contour, et son diamètre l'épaisseur. */
const upgradeLegacyPoint = (raw) =>
  raw.type === 'point' && (raw.stroke === 'none' || !(num(raw.strokeWidth, 0) > 0))
    ? {
        ...raw,
        rx: 0,
        ry: 0,
        fill: 'none',
        stroke: raw.fill,
        strokeWidth: 2 * num(raw.rx, num(raw.radius, 5)),
      }
    : raw;

/** Une couleur absente ou explicitement « none » ne peint rien. */
const isPainted = (value) => typeof value === 'string' && value !== '' && value !== 'none';

/**
 * Sommets d'un tracé, relatifs à son centre. Un sommet illisible lève plutôt
 * que d'être sauté : le retirer déformerait le dessin en silence.
 */
const readPoints = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) fail('Un tracé doit porter une liste de sommets.');
  if (raw.length > MAX_POINTS) fail(`Tracé de plus de ${MAX_POINTS} sommets.`);
  return raw.map((point) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail('Sommet de tracé illisible.');
    return { x, y };
  });
};

/* Borne de la pile booléenne d'une forme : au-delà, un fichier hostile
   multiplierait les masques sans fin. */
const MAX_BOOLEANS = 16;

const readBooleans = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_BOOLEANS)
    .filter((step) => typeof step?.with === 'string')
    .map((step) => ({ with: step.with, op: clampBooleanOp(step.op) }));

/* Nom propre d'une forme (depuis `@28`) : une chaîne non vide, bornée. */
const readName = (raw) => {
  const name = typeof raw === 'string' ? raw.trim().slice(0, MAX_NAME_LENGTH) : '';
  return name ? { name } : {};
};

/* `style` = couleur et épaisseur du calque, pour les formats qui les y rangeaient. */
const readElement = (input, style) => {
  if (input == null || typeof input !== 'object') fail('Une forme doit être un objet.');
  const raw = upgradeLegacyPoint(input);
  if (!Object.hasOwn(SHAPES, raw.type)) {
    fail(`Type de forme non pris en charge : ${String(raw.type)}.`);
  }
  const { defaults } = SHAPES[raw.type];
  const legacyRadius = num(raw.radius, undefined);
  return createElement(raw.type, num(raw.x, 0), num(raw.y, 0), {
    ...(typeof raw.id === 'string' && raw.id !== '' ? { id: raw.id } : {}),
    ...readName(raw.name),
    /* Ramenée à un tour : au-delà, le même dessin sous un nombre sans borne. */
    rotation: num(raw.rotation, 0) % 360,
    strokeWidth: raw.strokeWidth === undefined ? style.strokeWidth : Math.max(0, num(raw.strokeWidth, style.strokeWidth)),
    stroke: isPainted(raw.stroke) ? raw.stroke : isPainted(raw.fill) ? raw.fill : style.stroke,
    rx: clampExtent(raw.type, num(raw.rx, legacyRadius ?? defaults.rx)),
    ry: clampExtent(raw.type, num(raw.ry, legacyRadius ?? defaults.ry)),
    /* Avant `@6` le remplissage était une couleur : n'en reste que sa présence. */
    filled: typeof raw.filled === 'boolean' ? raw.filled : isPainted(raw.fill),
    dash: clampDash(raw.dash),
    linecap: clampLinecap(raw.linecap),
    outlined: raw.outlined === true,
    gap: clampGap(num(raw.gap, DEFAULT_OUTLINE_GAP)),
    booleans: readBooleans(raw.booleans),
    height: clampHeight(num(raw.height, 0)),
    /* Vérifié à l'échelle du calque (`readInside`), une fois toutes ses formes lues. */
    inside: typeof raw.inside === 'string' ? raw.inside : null,
    ...(raw.type === 'polygon'
      ? { sides: clampSides(num(raw.sides, defaults.sides)), inner: clampInner(num(raw.inner, defaults.inner)) }
      : {}),
    ...(raw.type === 'arc'
      ? {
          start: clampAngle(num(raw.start, defaults.start)),
          end: clampAngle(num(raw.end, defaults.end)),
          closure: Object.hasOwn(ARC_CLOSURES, raw.closure) ? raw.closure : 'open',
        }
      : {}),
    ...(raw.type === 'polyline' ? { points: readPoints(raw.points), closed: Boolean(raw.closed) } : {}),
    ...readStacks(raw, raw.type === 'point'),
  });
};

/* Piles propres d'une forme ; seul l'étage d'un point relie ses copies (`linear`). */
const readStacks = (raw, linkable) => {
  const modifiers = Array.isArray(raw.modifiers) ? raw.modifiers.map((entry) => readModifier(entry, false, linkable)) : [];
  return { modifiers, interpolations: readInterpolations({ interpolations: raw.interpolations ?? [] }, modifiers.length) };
};

/* Pivot propre d'un modificateur : absent ou invalide, l'étage reprend celui du calque. */
const readPivot = (raw) =>
  Number.isFinite(raw?.x) && Number.isFinite(raw?.y) ? { center: { x: raw.x, y: raw.y } } : {};

/* `orient` absent d'un fichier courant = réglage par défaut du type. */
/* `linkable` : étage d'une pile de point, le seul qui puisse relier ses copies. */
const readModifier = (raw, legacy, linkable = false) =>
  createModifier({
    ...(legacy ? { orient: false } : typeof raw?.orient === 'boolean' ? { orient: raw.orient } : {}),
    type: Object.hasOwn(MODIFIERS, raw?.type) ? raw.type : 'none',
    n: clampCount(raw?.n),
    stepX: num(raw?.stepX, 60),
    stepY: num(raw?.stepY, 0),
    angleStep: num(raw?.angleStep, 0.4),
    radiusStep: clampGrowth(num(raw?.radiusStep, 12)),
    ...readPivot(raw?.center),
    ...(Number.isFinite(raw?.axis) ? { axis: clampAxis(raw.axis) } : {}),
    ...(raw?.evenSpacing === true ? { evenSpacing: true } : {}),
    ...(linkable && raw?.linear === true ? { linear: true } : {}),
    ...(linkable && raw?.smooth === true ? { smooth: true } : {}),
  });

/**
 * Avant `@5` un calque portait un modificateur unique dans `modifier` : il se
 * relit comme une pile d'un seul élément, ce qui rend le même dessin.
 */
const readModifiers = (raw, legacy) => {
  const read = (entry) => readModifier(entry, legacy);
  if (Array.isArray(raw.modifiers)) return raw.modifiers.map(read);
  return raw.modifier == null ? [] : [read(raw.modifier)];
};

/**
 * Les formats `@1` et `@2` portaient une forme unique dans `baseElement` ; `@3`
 * porte une liste. Un ancien fichier se relit donc comme un calque à une forme.
 */
const rawElements = (raw) => {
  if (Array.isArray(raw.elements)) return raw.elements;
  return raw.baseElement == null ? [] : [raw.baseElement];
};

/* Un outil ne se cherche que parmi les autres formes du calque : absente,
   l'opération tombe plutôt que de rendre une forme invisible. */
const readElements = (raw) => {
  const style = { strokeWidth: readStrokeWidth(raw), stroke: readStroke(raw) };
  const elements = rawElements(raw).map((element) => readElement(element, style));
  const ids = new Set(elements.map((element) => element.id));
  const kept = elements.map((element) => ({
    ...element,
    booleans: element.booleans.filter((step) => step.with !== element.id && ids.has(step.with)),
  }));
  const layer = { elements: kept };
  if (kept.some((element) => element.booleans.some((step) => closesLoop(layer, element.id, step.with)))) {
    fail('Des opérations booléennes forment une boucle : les formes concernées seraient invisibles.');
  }
  return kept;
};

/**
 * Épaisseur du calque de `@4` à `@19`, reprise par les formes qui n'ont pas la
 * leur. Avant `@4` elle vivait déjà sur chaque forme ; une forme qui n'en a pas
 * se replie sur celle de la première forme.
 */
const readStrokeWidth = (raw) => {
  if (raw.strokeWidth !== undefined) {
    return Math.max(0, num(raw.strokeWidth, DEFAULT_STROKE_WIDTH));
  }
  const legacy = rawElements(raw)
    .filter((element) => element != null && typeof element === 'object')
    .map(upgradeLegacyPoint)
    .find((element) => element.strokeWidth !== undefined);
  return Math.max(0, num(legacy?.strokeWidth, DEFAULT_STROKE_WIDTH));
};

/**
 * Couleur du calque de `@6` à `@19`, reprise par les formes qui n'ont pas la
 * leur. Avant `@6` elle vivait sur chaque forme ; une forme non peinte se
 * replie sur le contour de la première forme peinte.
 */
const readStroke = (raw) => {
  if (isPainted(raw.stroke)) return raw.stroke;
  const legacy = rawElements(raw)
    .filter((element) => element != null && typeof element === 'object')
    .map(upgradeLegacyPoint)
    .find((element) => isPainted(element.stroke) || isPainted(element.fill));
  if (!legacy) return DEFAULT_STROKE;
  return isPainted(legacy.stroke) ? legacy.stroke : legacy.fill;
};

/* Plan 3D : absent ou illisible, le calque reste à plat. */
const readPlane = (raw) =>
  raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? {
        enabled: raw.enabled !== false,
        tilt: clampTilt(num(raw.tilt, DEFAULT_PLANE.tilt)),
        heading: clampHeading(num(raw.heading, DEFAULT_PLANE.heading)),
        sides: clampPlaneSides(raw.sides),
      }
    : null;

/**
 * Hôtes des formes logées : un hôte absent du calque, ouvert, ou qui fermerait
 * une boucle est oublié, la forme ressort. Pris dans l'ordre, chaque lien se
 * juge contre ceux déjà gardés.
 */
const readInside = (elements) =>
  elements.reduce((kept, element, index) => {
    const layer = { elements: kept.concat(elements.slice(index).map((rest) => ({ ...rest, inside: null }))) };
    const valid = element.inside !== null && insideHosts(layer, element.id).some((host) => host.id === element.inside);
    return [...kept, valid || element.inside === null ? element : { ...element, inside: null }];
  }, []);

const readLayer = (raw, index, legacy) => {
  if (raw == null || typeof raw !== 'object') fail(`Calque ${index} : objet attendu.`);
  if (typeof raw.id !== 'string' || raw.id === '') fail(`Calque ${index} : \`id\` manquant.`);
  const modifiers = readModifiers(raw, legacy);
  return createLayer({
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : `Calque ${index + 1}`,
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
    center: {
      x: num(raw.center?.x, STAGE.width / 2),
      y: num(raw.center?.y, STAGE.height / 2),
    },
    elements: readInside(readElements(raw)),
    modifiers,
    interpolations: readInterpolations(raw, modifiers.length),
    evenOdd: raw.evenOdd === true,
    plane: readPlane(raw.plane),
  });
};

/**
 * @param {string} text contenu JSON brut
 * @returns {{layers: object[], activeLayerId: string|null}}
 * @throws {Error} message destiné à être affiché tel quel à l'utilisateur
 */
export const deserialize = (text) => {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('Fichier illisible : ce n’est pas du JSON valide.');
  }
  if (raw == null || typeof raw !== 'object') fail('Le fichier ne contient pas un objet JSON.');
  if (!READABLE_FORMATS.has(raw.format)) {
    fail(`Format inattendu : « ${String(raw.format)} » au lieu de « ${FORMAT} ».`);
  }
  if (!Array.isArray(raw.layers)) fail('`layers` doit être un tableau.');

  /* Avant `@13`, pas d'orientation des copies. */
  const legacy = raw.format.startsWith('illu/') && Number(raw.format.split('@')[1]) < 13;
  const layers = raw.layers.map((layer, index) => readLayer(layer, index, legacy));
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length) {
    fail('Deux calques portent le même identifiant.');
  }

  const elementIds = layers.flatMap((layer) => layer.elements.map((element) => element.id));
  if (new Set(elementIds).size !== elementIds.length) {
    fail('Deux formes portent le même identifiant.');
  }
  reserveIds(layers);

  const activeLayerId = layers.some((layer) => layer.id === raw.activeLayerId)
    ? raw.activeLayerId
    : (layers.at(-1)?.id ?? null);
  const activeElementId = elementIds.includes(raw.activeElementId) ? raw.activeElementId : null;

  return { layers, activeLayerId, activeElementId };
};

/* ---- Supports ---- */

export const saveLocal = (scene) => {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(scene));
  } catch {
    /* Quota plein ou stockage refusé : l'autosave est un confort, pas le
       support principal — l'export fichier reste disponible. */
  }
};

/**
 * @returns {{scene: object|null, error: string|null}}
 *
 * Distingue « aucune sauvegarde » d'« une sauvegarde illisible » : la seconde
 * efface le travail de l'utilisateur et doit le lui dire, contrairement à
 * `saveLocal` dont l'échec est rattrapable par l'export fichier.
 */
export const loadLocal = () => {
  let text;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { scene: null, error: null };
  }
  if (!text) return { scene: null, error: null };
  try {
    return { scene: deserialize(text), error: null };
  } catch (error) {
    return { scene: null, error: error.message };
  }
};

export const download = (contents, filename, mime) => {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/** Repousse les écritures tant que les changements s'enchaînent (sliders). */
export const debounce = (fn, delay = 400) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
