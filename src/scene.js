import { applyStack, clampAxis, clampGrowth, copyCount, createModifier, effectiveCount, MAX_COPIES, stackCopies } from './modifiers.js';
import { clampCount, ramp, stackValues } from './interpolate.js';

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
 * équidistants et `divisions` rayons. Au-delà du cercle `last` (par défaut le
 * dernier), on s'y tient — une grille dépliée en 3D en trace davantage.
 */
export const snapToPolarGrid = ({ x, y }, circles, divisions, last = circles) => {
  const { center, radius } = POLAR_GRID;
  const ring = radius / circles;
  const sector = (2 * Math.PI) / divisions;
  const r = Math.min(last, Math.round(Math.hypot(x - center.x, y - center.y) / ring)) * ring;
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
  /* Degrés ajoutés à l'angle propre de la copie. Additive, neutre 0 : un
     produit mettrait toutes les copies à 0° dès qu'une rampe part de 0. */
  rotation: { min: -720, max: 720, step: 1, identity: 0, defaultRange: [0, 180], additive: true, unit: '°' },
  /* Facteur de l'épaisseur du calque, comme l'échelle l'est de la taille. */
  strokeWidth: { min: 0, max: 5, step: 0.01, identity: 1, defaultRange: [1, 0.2] },
  /* Étirement : facteurs de `rx`/`ry` (et des sommets d'un tracé), dans le
     repère de la forme, avant sa rotation. Sans effet sur le point. */
  scaleX: { min: 0, max: 3, step: 0.01, identity: 1, defaultRange: [1, 0.2] },
  scaleY: { min: 0, max: 3, step: 0.01, identity: 1, defaultRange: [1, 0.2] },
  /* Décalage des tirets, en multiples de l'épaisseur comme le motif. Additive :
     deux défilements s'ajoutent. Sans effet sur un trait plein. */
  dashOffset: { min: -100, max: 100, step: 0.5, identity: 0, defaultRange: [0, 6], additive: true, unit: '× ép.' },
  /* Couleur du trait et de l'aplat, qui remplace celle du calque. Pas de
     bornes numériques : une plage de deux `#rrggbb`, du trait par défaut à
     l'accent. */
  color: { color: true, defaultRange: ['#7dd3c0', '#ee4722'] },
};

export const RANGE_LABELS = {
  opacity: 'Opacité',
  scale: 'Échelle',
  rotation: 'Rotation',
  strokeWidth: 'Épaisseur',
  scaleX: 'Étirement X',
  scaleY: 'Étirement Y',
  dashOffset: 'Décalage des tirets',
  color: 'Couleur',
};

/** `#rrggbb`, seule écriture que le mélange de couleurs et `<input type="color">` lisent. */
export const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

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
  /* Maj au dessin la rend ronde : pas d'outil cercle à part. */
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

export const DEFAULT_SHAPE = 'ellipse';

/* Au-delà, un polygone ne se distingue plus d'un cercle. */
export const MAX_SIDES = 64;

export const clampSides = (value) =>
  Math.min(MAX_SIDES, Math.max(3, Math.round(Number.isFinite(value) ? value : 6)));

export const ARC_CLOSURES = { open: 'Ouvert', chord: 'Corde', sector: 'Secteur' };

/* Un tour dans chaque sens : `end - start` suffit à dire l'étendue, au-delà le
   même dessin sous un nombre sans borne. */
export const clampAngle = (value, fallback = 0) =>
  Math.min(360, Math.max(-360, Number.isFinite(value) ? value : fallback));

/* Plan 3D d'un calque. Défaut : inclinaison et orientation à 45°. `sides` =
   flancs de l'extrusion : traits seuls, ou peints de la couleur pleine de la forme. */
export const PLANE_SIDES = { transparent: 'Transparents', filled: 'Colorés' };
export const DEFAULT_PLANE = { enabled: true, tilt: 45, heading: 45, sides: 'transparent' };

/** Plan 3D effectif d'un calque : `null` s'il n'en a pas ou qu'il est éteint (`enabled` absent = allumé). */
export const activePlane = (layer) => (layer?.plane && layer.plane.enabled !== false ? layer.plane : null);
/* Profondeur donnée aux formes à plat d'un calque qui passe en 3D, et aux
   formes qu'on y ajoute : sans elle, activer le plan ne montrerait aucun volume. */
export const DEFAULT_DEPTH = 80;
/* 90° verrait le plan par la tranche : la projection ne s'inverserait plus. */
export const MAX_TILT = 89;
export const clampTilt = (value) =>
  Math.min(MAX_TILT, Math.max(0, Number.isFinite(value) ? value : DEFAULT_PLANE.tilt));
export const clampHeading = (value) => (((Number.isFinite(value) ? value : 0) % 360) + 360) % 360;
export const clampPlaneSides = (value) => (Object.hasOwn(PLANE_SIDES, value) ? value : DEFAULT_PLANE.sides);
export const MAX_HEIGHT = 1000;
/* Centrée, une profondeur négative dessinerait la même chose : sa valeur absolue. */
export const clampHeight = (value) => Math.min(MAX_HEIGHT, Math.abs(Number.isFinite(value) ? value : 0));

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
/**
 * Patch d'une mise à l'échelle dans le repère de la forme (poignées du cadre),
 * autour de son centre. Forme uniforme : un seul facteur, celui qui a bougé ;
 * point : rien, l'épaisseur le dimensionne.
 */
export const scaledPatch = (element, fx, fy) => {
  const { geometry, uniform } = SHAPES[element.type];
  if (geometry === 'dot') return {};
  if (uniform) {
    const f = fx !== 1 ? fx : fy;
    return { rx: element.rx * f, ry: element.ry * f };
  }
  if (element.points) return { points: element.points.map((p) => ({ x: p.x * fx, y: p.y * fy })) };
  return { rx: element.rx * fx, ry: element.ry * fy };
};

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
 * L'épaisseur du trait appartient à la forme : un même calque peut mêler un
 * trait fin et un trait épais. C'est aussi ce qui donne son diamètre au point,
 * faute d'étendue propre.
 */
export const DEFAULT_STROKE_WIDTH = 1.5;

/**
 * La couleur appartient à la forme, comme l'épaisseur. Le remplissage n'a pas
 * de teinte propre — rempli, une forme se peint de son contour.
 */
export const DEFAULT_STROKE = '#7dd3c0';

/**
 * Le style de trait appartient à la forme, pas au calque : un même calque peut
 * mêler un anneau pointillé et un cercle plein. Le motif de tirets est exprimé
 * en multiples de l'épaisseur de la forme : un pointillé reste un pointillé quand
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

/** Opérations booléennes entre une forme et ses outils, comme un pathfinder. */
export const BOOLEAN_OPS = { union: 'Fusion', subtract: 'Découpe', intersect: 'Intersection' };
export const DEFAULT_BOOLEAN_OP = 'intersect';
export const clampBooleanOp = (value) => (Object.hasOwn(BOOLEAN_OPS, value) ? value : DEFAULT_BOOLEAN_OP);

export const clampLinecap = (value) => (Object.hasOwn(LINECAPS, value) ? value : DEFAULT_LINECAP);

/* Contour double : deux traits de l'épaisseur de la forme, séparés par un vide
   de `gap`, l'ensemble centré sur la géométrie. Ni l'un ni l'autre ne suit
   l'échelle de la copie, comme l'épaisseur. */
export const DEFAULT_OUTLINE_GAP = 1.5;
const MAX_OUTLINE_GAP = 100;
export const clampGap = (value) => Math.min(MAX_OUTLINE_GAP, Math.max(0, Number.isFinite(value) ? value : DEFAULT_OUTLINE_GAP));

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
 * Pas de mémoïsation ici : le renderer retient le dessin de chaque calque tant
 * que sa référence ne change pas (`drawLayer`), ce qui suffit.
 */

/**
 * Facteur de rampe d'une interpolation pour la copie `i` de la pile de `owner`
 * (calque ou forme).
 *
 * Liée à un modificateur, l'interpolation ne lit que l'indice de cet étage :
 * deux copies qui n'en diffèrent pas partagent la même valeur. Une liaison qui
 * ne désigne plus de modificateur — fichier importé, étage supprimé ailleurs —
 * retombe sur la rampe globale plutôt que de rendre `NaN`.
 */
const rangeFactor = (owner, { binding, curve, seed }, indices, i, total) => {
  const modifier = binding === null ? null : owner.modifiers[binding];
  return modifier ? ramp(curve, indices[binding], effectiveCount(modifier), seed) : ramp(curve, i, total, seed);
};

/**
 * Copies dessinées du calque : celles de sa pile, fois celles de chaque forme.
 * Un calque vide compte comme une forme sans pile : sa pile trop lourde se
 * signale avant la première forme posée.
 */
export const copyTotal = (layer) =>
  copyCount(layer.modifiers) * (layer.elements.reduce((sum, element) => sum + copyCount(element.modifiers), 0) || 1);

/** Pile qui dépasse `MAX_COPIES` : le calque n'est pas rendu, le panneau le dit. */
export const isSuspended = (layer) => copyTotal(layer) > MAX_COPIES;

/* Étirement interpolé, dans le repère de la forme : demi-extensions et
   sommets d'un tracé. Rien à étirer sur un point (extensions nulles).
   ponytail: polygone et arc ne lisent que `rx` — seul l'étirement X les
   touche (uniformément). Les échantillonner en tracé le jour où il faut les aplatir. */
const stretch = (element, sx, sy) => {
  if (sx === 1 && sy === 1) return {};
  return {
    rx: element.rx * sx,
    ry: element.ry * sy,
    ...(element.points ? { points: element.points.map((p) => ({ x: p.x * sx, y: p.y * sy })) } : {}),
  };
};

/**
 * Chaque copie `i` du calque répète chaque forme, et chaque forme ses copies
 * propres `j` : la pile de la forme s'applique d'abord, celle du calque ensuite
 * (orientation comprise). Les interpolations de la forme courent sur ses
 * copies propres et se composent avec celles du calque — la couleur de la
 * forme, dernière de la pile, l'emporte.
 *
 * `copy` = rang de la copie du calque, `own` = rang de la copie propre : le
 * booléen et la forme logée s'apparient sur les deux.
 */
export const getRenderedChildren = (layer) => {
  if (layer.elements.length === 0 || isSuspended(layer)) return [];
  const copies = stackCopies(layer.modifiers);
  const children = [];
  copies.forEach((indices, i) => {
    for (const element of layer.elements) {
      const ownCopies = stackCopies(element.modifiers);
      const own = ownCopies.map((ownIndices, j) => {
        const factors = new Map([
          ...layer.interpolations.map((it) => [it, rangeFactor(layer, it, indices, i, copies.length)]),
          ...element.interpolations.map((it) => [it, rangeFactor(element, it, ownIndices, j, ownCopies.length)]),
        ]);
        const {
          rotation: twist = 0,
          strokeWidth: widthFactor = 1,
          scaleX = 1,
          scaleY = 1,
          color,
          ...properties
        } = stackValues(
          [...factors.keys()],
          (interpolation) => factors.get(interpolation),
          RANGE_BOUNDS,
        );
        const local = applyStack(element, element.modifiers, ownIndices, layer.center);
        const { x, y, angle, flip } = applyStack(local, layer.modifiers, indices, layer.center);
        /* Orientation de la copie puis rotation propre : `R(a)·S·R(r) = R(a − r)·S`,
           le reflet inverse le sens de l'angle propre — vrille interpolée comprise,
           pour qu'un motif miroir vrille en miroir. */
        const spin = (element.rotation ?? 0) + twist;
        return {
          ...element,
          ...stretch(element, scaleX, scaleY),
          strokeWidth: element.strokeWidth * widthFactor,
          stroke: color ?? element.stroke,
          fill: element.filled ? (color ?? element.stroke) : 'none',
          x,
          y,
          rotation: (angle * 180) / Math.PI + (flip ? -spin : spin),
          flip,
          copy: i,
          own: j,
          ...properties,
        };
      });
      const place = (ownIndices) =>
        applyStack(applyStack(element, element.modifiers, ownIndices, layer.center), layer.modifiers, indices, layer.center);
      children.push(...(element.type === 'point' ? linkPoints(element.modifiers, ownCopies, own, place) : own));
    }
  });
  return children;
};

/**
 * Étages dont la case « Activer les répétitions linéaires » est cochée, avec
 * leur pas dans la numérotation de `stackCopies` (le dernier étage varie le
 * plus vite). Un étage d'une seule copie n'a rien à relier. L'axial se referme :
 * sa dernière copie rejoint la première.
 */
const linearStages = (modifiers) =>
  modifiers.flatMap((modifier, k) => {
    const n = effectiveCount(modifier);
    if (!modifier.linear || n < 2) return [];
    const stride = modifiers.slice(k + 1).reduce((total, next) => total * effectiveCount(next), 1);
    return [{ k, n, stride, wrap: modifier.type === 'axial' && n > 2, smooth: modifier.smooth === true }];
  });

/* Chaîne des copies d'un point le long d'un étage : un seul tracé, pour que
   tirets et contour double courent d'un bout à l'autre sans casser aux
   jointures. Elle porte le style de trait du point et les valeurs
   interpolées de sa première copie. L'échelle de la copie passe dans
   l'épaisseur et l'écart, comme pour le point : les sommets tombent pile sur
   les copies. */
const chain = (from, links, closed, smooth) => ({
  ...from,
  type: 'polyline',
  points: links.map((link) => ({ x: link.x - from.x, y: link.y - from.y })),
  closed,
  smooth,
  fill: 'none',
  rotation: 0,
  flip: false,
  strokeWidth: from.strokeWidth * (from.scale ?? 1),
  gap: from.gap * (from.scale ?? 1),
  scale: 1,
});

/**
 * Répétition linéaire : portée par l'étage, pas par le point. Un point ne se
 * dessine plus copie par copie ; le long de chaque étage coché de **sa propre** pile, ses copies
 * successives forment un tracé, émis à la première copie de la rangée. Les
 * étages du calque ne relient jamais : chaque copie du calque porte ses
 * propres tracés. Aucun étage coché : les points restent des points.
 *
 * ponytail: une chaîne n'a qu'une couleur, une opacité, une épaisseur — celles
 * de sa première copie. Un dégradé le long du tracé demanderait de le
 * découper, ce que le contour double interdit.
 */
/* Sommets intermédiaires par intervalle d'une chaîne lissée. */
const SMOOTH_STEPS = 12;

/* Lissé, le tracé suit la transformation même de l'étage à indice
   fractionnaire — arc de spirale, de cercle ou segment exacts, passant par
   chaque copie (indices entiers). Une approximation (Catmull-Rom) ondulait
   entre les copies dès que le pas angulaire s'élargit. À deux copies (miroir),
   un segment. */
const sweep = (indices, k, n, closed, place) =>
  Array.from({ length: (closed ? n : n - 1) * SMOOTH_STEPS + (closed ? 0 : 1) }, (_, s) =>
    place(indices.with(k, s / SMOOTH_STEPS)),
  );

const linkPoints = (modifiers, copies, points, place) => {
  const stages = linearStages(modifiers);
  if (stages.length === 0) return points;
  return points.flatMap((point, j) =>
    stages
      .filter(({ k }) => copies[j][k] === 0)
      .map(({ k, n, stride, wrap, smooth }) => {
        const links =
          smooth && n > 2
            ? sweep(copies[j], k, n, wrap, place)
            : Array.from({ length: n }, (_, step) => points[j + step * stride]);
        return chain(point, links, wrap, smooth);
      }),
  );
};

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
    range[index] = color ? value : Math.min(max, Math.max(min, value));
    return { ...interpolation, range };
  });
