import { MODIFIERS } from './modifiers.js';
import { clampCount } from './interpolate.js';
import {
  createElement,
  createLayer,
  RANGE_BOUNDS,
  reserveIds,
  SHAPES,
  STAGE,
} from './scene.js';

/* La clé ne suit pas la version du format : la changer orphelinerait
   l'autosave déjà posée chez les utilisateurs, alors que `deserialize` sait
   relire les anciens formats. */
const STORAGE_KEY = 'illu:scene:v1';
export const FORMAT = 'illu/scene@3';

/* Les formats antérieurs restent lisibles :
   - `@1` décrivait la forme par un `radius` unique, avant le rectangle ;
   - `@1` et `@2` n'avaient qu'une forme par calque, dans `baseElement`. */
const READABLE_FORMATS = new Set(['illu/scene@1', 'illu/scene@2', FORMAT]);

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

const readElement = (raw) => {
  if (raw == null || typeof raw !== 'object') fail('Une forme doit être un objet.');
  if (!Object.hasOwn(SHAPES, raw.type)) {
    fail(`Type de forme non pris en charge : ${String(raw.type)}.`);
  }
  const { defaults } = SHAPES[raw.type];
  const legacyRadius = num(raw.radius, undefined);
  return createElement(raw.type, num(raw.x, 0), num(raw.y, 0), {
    ...(typeof raw.id === 'string' && raw.id !== '' ? { id: raw.id } : {}),
    rx: Math.max(0, num(raw.rx, legacyRadius ?? defaults.rx)),
    ry: Math.max(0, num(raw.ry, legacyRadius ?? defaults.ry)),
    fill: typeof raw.fill === 'string' ? raw.fill : defaults.fill,
    stroke: typeof raw.stroke === 'string' ? raw.stroke : defaults.stroke,
    strokeWidth: Math.max(0, num(raw.strokeWidth, defaults.strokeWidth)),
  });
};

const readModifier = (raw) => {
  const type = Object.hasOwn(MODIFIERS, raw?.type) ? raw.type : 'none';
  return {
    type,
    n: clampCount(raw?.n),
    angleStep: num(raw?.angleStep, 0.4),
    radiusStep: num(raw?.radiusStep, 12),
  };
};

/**
 * Les formats `@1` et `@2` portaient une forme unique dans `baseElement` ; `@3`
 * porte une liste. Un ancien fichier se relit donc comme un calque à une forme.
 */
const readElements = (raw) => {
  if (Array.isArray(raw.elements)) return raw.elements.map(readElement);
  return raw.baseElement == null ? [] : [readElement(raw.baseElement)];
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
    elements: readElements(raw),
    modifier: readModifier(raw.modifier),
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
