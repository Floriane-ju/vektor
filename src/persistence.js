import { createModifier, MODIFIERS } from './modifiers.js';
import { clampCount } from './interpolate.js';
import {
  clampExtent,
  createElement,
  createLayer,
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH,
  RANGE_BOUNDS,
  reserveIds,
  SHAPES,
  STAGE,
} from './scene.js';

/* La clé ne suit pas la version du format : la changer orphelinerait
   l'autosave déjà posée chez les utilisateurs, alors que `deserialize` sait
   relire les anciens formats. */
const STORAGE_KEY = 'illu:scene:v1';
export const FORMAT = 'illu/scene@6';

/* Les formats antérieurs restent lisibles :
   - `@1` décrivait la forme par un `radius` unique, avant le rectangle ;
   - `@1` et `@2` n'avaient qu'une forme par calque, dans `baseElement` ;
   - `@1` à `@3` portaient l'épaisseur sur chaque forme, pas sur le calque ;
   - `@1` à `@4` n'avaient qu'un modificateur par calque, dans `modifier` ;
   - `@1` à `@5` portaient la couleur sur chaque forme, pas sur le calque. */
const READABLE_FORMATS = new Set([
  'illu/scene@1',
  'illu/scene@2',
  'illu/scene@3',
  'illu/scene@4',
  'illu/scene@5',
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

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const clamp = (value, { min, max, identity }) =>
  Math.min(max, Math.max(min, num(value, identity)));

/** Une plage absente ou partielle se replie sur la valeur neutre, jamais sur une borne. */
const readRange = (ranges, key) => {
  const bounds = RANGE_BOUNDS[key];
  const raw = Array.isArray(ranges?.[key]) ? ranges[key] : [];
  return [clamp(raw[0], bounds), clamp(raw[1], bounds)];
};

/* Ancien point : un disque plein sans contour. Sa couleur de remplissage
   devient celle du contour, et son diamètre l'épaisseur — reprise par le calque,
   qui porte désormais cette valeur. */
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

const readElement = (input) => {
  if (input == null || typeof input !== 'object') fail('Une forme doit être un objet.');
  const raw = upgradeLegacyPoint(input);
  if (!Object.hasOwn(SHAPES, raw.type)) {
    fail(`Type de forme non pris en charge : ${String(raw.type)}.`);
  }
  const { defaults } = SHAPES[raw.type];
  const legacyRadius = num(raw.radius, undefined);
  return createElement(raw.type, num(raw.x, 0), num(raw.y, 0), {
    ...(typeof raw.id === 'string' && raw.id !== '' ? { id: raw.id } : {}),
    rx: clampExtent(raw.type, num(raw.rx, legacyRadius ?? defaults.rx)),
    ry: clampExtent(raw.type, num(raw.ry, legacyRadius ?? defaults.ry)),
    /* Avant `@6` le remplissage était une couleur : n'en reste que sa présence. */
    filled: typeof raw.filled === 'boolean' ? raw.filled : isPainted(raw.fill),
  });
};

const readModifier = (raw) =>
  createModifier({
    type: Object.hasOwn(MODIFIERS, raw?.type) ? raw.type : 'none',
    n: clampCount(raw?.n),
    stepX: num(raw?.stepX, 60),
    stepY: num(raw?.stepY, 0),
    angleStep: num(raw?.angleStep, 0.4),
    radiusStep: num(raw?.radiusStep, 12),
  });

/**
 * Avant `@5` un calque portait un modificateur unique dans `modifier` : il se
 * relit comme une pile d'un seul élément, ce qui rend le même dessin.
 */
const readModifiers = (raw) => {
  if (Array.isArray(raw.modifiers)) return raw.modifiers.map(readModifier);
  return raw.modifier == null ? [] : [readModifier(raw.modifier)];
};

/**
 * Les formats `@1` et `@2` portaient une forme unique dans `baseElement` ; `@3`
 * porte une liste. Un ancien fichier se relit donc comme un calque à une forme.
 */
const rawElements = (raw) => {
  if (Array.isArray(raw.elements)) return raw.elements;
  return raw.baseElement == null ? [] : [raw.baseElement];
};

const readElements = (raw) => rawElements(raw).map(readElement);

/**
 * Épaisseur du calque. Avant `@4` elle vivait sur chaque forme : un ancien
 * fichier se replie sur celle de sa première forme, quitte à aplatir un calque
 * qui en mélangeait plusieurs — c'est le sens même de la bascule.
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
 * Couleur du calque. Avant `@6` elle vivait sur chaque forme : un ancien
 * fichier se replie sur le contour de sa première forme peinte, quitte à
 * aplatir un calque qui en mélangeait plusieurs — c'est le sens de la bascule.
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

const readLayer = (raw, index) => {
  if (raw == null || typeof raw !== 'object') fail(`Calque ${index} : objet attendu.`);
  if (typeof raw.id !== 'string' || raw.id === '') fail(`Calque ${index} : \`id\` manquant.`);
  return createLayer({
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : `Calque ${index + 1}`,
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
    center: {
      x: num(raw.center?.x, STAGE.width / 2),
      y: num(raw.center?.y, STAGE.height / 2),
    },
    strokeWidth: readStrokeWidth(raw),
    stroke: readStroke(raw),
    elements: readElements(raw),
    modifiers: readModifiers(raw),
    propertyRanges: {
      opacity: readRange(raw.propertyRanges, 'opacity'),
      scale: readRange(raw.propertyRanges, 'scale'),
    },
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

  const layers = raw.layers.map(readLayer);
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
