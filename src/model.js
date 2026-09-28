/* Sources uniques du modèle : plan de référence, grilles, formes (`SHAPES`),
   plages d'interpolation (`RANGE_BOUNDS`), bornes et valeurs par défaut.
   Ré-exporté par `scene.js`, qui reste le point d'entrée. */
import { boundsOf, clamp, radians, wrapAngle } from './math.js';

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
const MAX_SIDES = 64;

export const clampSides = (value) =>
  clamp(Math.round(Number.isFinite(value) ? value : 6), 3, MAX_SIDES);

export const ARC_CLOSURES = { open: 'Ouvert', chord: 'Corde', sector: 'Secteur' };

/* Un tour dans chaque sens : `end - start` suffit à dire l'étendue, au-delà le
   même dessin sous un nombre sans borne. */
export const clampAngle = (value, fallback = 0) =>
  clamp(Number.isFinite(value) ? value : fallback, -360, 360);

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
  clamp(Number.isFinite(value) ? value : DEFAULT_PLANE.tilt, 0, MAX_TILT);
export const clampHeading = (value) => wrapAngle(Number.isFinite(value) ? value : 0);
export const clampPlaneSides = (value) => (Object.hasOwn(PLANE_SIDES, value) ? value : DEFAULT_PLANE.sides);
const MAX_HEIGHT = 1000;
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
  const box = boundsOf(absolute);
  const x = (box.minX + box.maxX) / 2;
  const y = (box.minY + box.maxY) / 2;
  return { x, y, points: absolute.map((p) => ({ x: p.x - x, y: p.y - y })) };
};

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

/** Tourne un vecteur de `degrees` : le repère d'une forme vers celui de l'écran. */
export const rotateVector = ({ x, y }, degrees) => {
  const angle = radians(degrees);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
};

/* Sommets dans le repère de la forme, sans sa rotation : c'est dans ce repère
   que le tracé se dessine et se recentre. */
export const absolutePoints = (element) =>
  element.points.map((p) => ({ x: element.x + p.x, y: element.y + p.y }));

/** `inner` en % : 100 = polygone convexe, 0 = étoile réduite à ses rayons. */
export const clampInner = (value) => clamp(Number.isFinite(value) ? value : 100, 0, 100);

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
    .map((value) => clamp(value, 0, MAX_DASH_VALUE));
  /* Que des zéros : SVG trace plein, autant le dire. */
  return dash.some((value) => value > 0) ? dash : [];
};

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
export const clampGap = (value) => clamp(Number.isFinite(value) ? value : DEFAULT_OUTLINE_GAP, 0, MAX_OUTLINE_GAP);
