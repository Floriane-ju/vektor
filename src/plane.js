import polygonClipping from 'polygon-clipping';
import { clampExtent, SHAPES, STAGE } from './scene.js';

/**
 * Plan 3D d'un calque : le motif, composé à plat par la pile de modificateurs,
 * est posé sur un plan incliné puis vu en projection orthographique — les
 * parallèles restent parallèles, comme dans une vue isométrique.
 *
 * `tilt` = inclinaison du plan (0 = vu de face), `heading` = direction de la
 * pente, en degrés à l'écran. Le plan pivote autour du centre de la scène, et
 * non du pivot du calque : déplacer un pivot ne doit pas faire glisser tout le
 * dessin.
 */

const radians = (value) => (value * Math.PI) / 180;
const ORIGIN = { x: STAGE.width / 2, y: STAGE.height / 2 };

/* Échantillons d'un contour courbe projeté : même finesse que les boîtes. */
const CURVE_SAMPLES = 64;

/**
 * Matrice affine `{ a, b, c, d, e, f }` (ordre de `matrix()` en SVG) :
 * `R(heading)·diag(1, cos tilt)·R(−heading)` autour du centre de la scène.
 */
export const planeMatrix = ({ tilt, heading }) => {
  const [cos, sin, k] = [Math.cos(radians(heading)), Math.sin(radians(heading)), Math.cos(radians(tilt))];
  const a = cos * cos + sin * sin * k;
  const d = sin * sin + cos * cos * k;
  const b = cos * sin * (1 - k);
  const c = b;
  return { a, b, c, d, e: ORIGIN.x - (a * ORIGIN.x + c * ORIGIN.y), f: ORIGIN.y - (b * ORIGIN.x + d * ORIGIN.y) };
};

export const project = ({ a, b, c, d, e, f }, { x, y }) => ({ x: a * x + c * y + e, y: b * x + d * y + f });

/** Point de l'écran ramené dans le repère du plan. `tilt` < 90 : toujours inversible. */
export const unproject = ({ a, b, c, d, e, f }, { x, y }) => {
  const det = a * d - b * c;
  const [dx, dy] = [x - e, y - f];
  return { x: (d * dx - c * dy) / det, y: (a * dy - b * dx) / det };
};

/** Même matrice, décalée à l'écran de `v` : la face extrudée. */
export const shifted = (matrix, v) => ({ ...matrix, e: matrix.e + v.x, f: matrix.f + v.y });

/**
 * Vecteur écran d'une extrusion de `height` le long de la normale du plan :
 * positif vers le haut de l'écran quand la pente descend vers le bas.
 */
export const extrusion = ({ tilt, heading }, height) => {
  const length = height * Math.sin(radians(tilt));
  return { x: length * Math.sin(radians(heading)), y: -length * Math.cos(radians(heading)) };
};

/**
 * Sommets d'un polygone régulier, le premier en haut. Sous 100 % de `inner`,
 * un sommet creux s'intercale entre deux sommets : l'étoile. À 100 % il
 * tomberait sur le côté, donc il est omis — même dessin, moitié moins de points.
 */
export const polygonVertices = (cx, cy, radius, sides, inner) => {
  const star = inner < 100;
  const count = star ? sides * 2 : sides;
  const hollow = radius * Math.cos(Math.PI / sides) * (inner / 100);
  return Array.from({ length: count }, (_, i) => {
    const r = star && i % 2 === 1 ? hollow : radius;
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
};

const every = (points) => points.map((_, i) => i);

/**
 * Contour ordonné d'une copie rendue, dans le repère du plan, reflet et
 * rotation cuits comme dans `areaPath` : `{ points, closed, corners }`.
 * `corners` = sommets anguleux, dont l'arête de flanc se dessine toujours ;
 * une courbe échantillonnée n'en a pas, seule sa silhouette en montre.
 */
export const outlinePath = (child) => {
  const scale = child.scale ?? 1;
  const rx = clampExtent(child.type, child.rx * scale);
  const ry = clampExtent(child.type, child.ry * scale);
  const { x, y } = child;
  const rotation = radians(child.rotation ?? 0);
  const [cos, sin] = [Math.cos(rotation), Math.sin(rotation)];
  const place = (p) => {
    const dx = child.flip ? x - p.x : p.x - x;
    const dy = p.y - y;
    return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos };
  };
  /* 0° en haut, sens horaire, comme l'arc et le premier sommet du polygone. */
  const around = (from, span, radiusX, radiusY, count) =>
    Array.from({ length: count }, (_, i) => {
      const angle = radians(from + (span * i) / CURVE_SAMPLES);
      return { x: x + radiusX * Math.sin(angle), y: y - radiusY * Math.cos(angle) };
    });
  const polygon = (points) => ({ points: points.map(place), closed: true, corners: every(points) });

  switch (SHAPES[child.type].geometry) {
    case 'dot':
      return { points: [{ x, y }], closed: false, corners: [0] };
    case 'line':
      return {
        points: [place({ x: x - rx, y: y - ry }), place({ x: x + rx, y: y + ry })],
        closed: false,
        corners: [0, 1],
      };
    case 'rect':
      return polygon([
        { x: x - rx, y: y - ry },
        { x: x + rx, y: y - ry },
        { x: x + rx, y: y + ry },
        { x: x - rx, y: y + ry },
      ]);
    case 'polygon':
      return polygon(polygonVertices(x, y, rx, child.sides, child.inner));
    case 'polyline': {
      const points = child.points.map((p) => place({ x: x + p.x * scale, y: y + p.y * scale }));
      /* Chaîne lissée : une courbe, seuls ses bouts sont anguleux. */
      const ends = child.closed ? [] : [0, points.length - 1];
      return { points, closed: Boolean(child.closed), corners: child.corners ?? (child.smooth ? ends : every(points)) };
    }
    case 'arc': {
      const span = child.end - child.start;
      if (Math.abs(span) >= 360) {
        return { points: around(child.start, 360, rx, rx, CURVE_SAMPLES).map(place), closed: true, corners: [] };
      }
      /* Un arc à rebours court quand même en sens horaire, comme `arcPath`. */
      const sweep = ((span % 360) + 360) % 360;
      const arc = around(child.start, sweep, rx, rx, CURVE_SAMPLES + 1);
      const points = (child.closure === 'sector' ? [...arc, { x, y }] : arc).map(place);
      const ends = child.closure === 'sector' ? [0, arc.length - 1, arc.length] : [0, arc.length - 1];
      return { points, closed: child.closure !== 'open', corners: ends };
    }
    default:
      return { points: around(0, 360, rx, ry, CURVE_SAMPLES).map(place), closed: true, corners: [] };
  }
};

const CLIP = { union: 'union', subtract: 'difference', intersect: 'intersection' };
const pointKey = (p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;

/**
 * Contour réel d'une forme booléenne, dans le repère du plan, pour l'extruder :
 * un tracé fermé par morceau du résultat, à dessiner comme la forme (même
 * style, échelle cuite). Ses coins = ceux des formes d'origine et les
 * jonctions entre elles ; les sommets d'une courbe échantillonnée n'en sont
 * pas. `null` si un contour est ouvert ou si le résultat a un trou : le rendu
 * à plat par masques reprend.
 *
 * ponytail: pas de trou extrudé (disque moins disque intérieur) ; passer le
 * trou comme bord intérieur d'un anneau (`planeDouble`) si le besoin vient.
 */
export const booleanPieces = (child, steps) => {
  const outlines = [child, ...steps.map((step) => step.shape)].map(outlinePath);
  if (outlines.some((outline) => !outline.closed || outline.points.length < 3)) return null;
  const smooth = new Set(
    outlines.flatMap(({ points, corners }) => {
      const sharp = new Set(corners);
      return points.filter((_, i) => !sharp.has(i)).map(pointKey);
    }),
  );
  const ring = ({ points }) => [points.map((p) => [p.x, p.y])];
  const result = steps.reduce(
    (region, step, i) => polygonClipping[CLIP[step.op]](region, ring(outlines[i + 1])),
    [ring(outlines[0])],
  );
  if (result.some((polygon) => polygon.length > 1)) return null;
  const scale = child.scale ?? 1;
  return result.map(([outer]) => {
    const points = outer.slice(0, -1).map(([x, y]) => ({ x, y }));
    return {
      ...child,
      type: 'polyline',
      points: points.map((p) => ({ x: p.x - child.x, y: p.y - child.y })),
      closed: true,
      corners: points.flatMap((p, i) => (smooth.has(pointKey(p)) ? [] : [i])),
      rotation: 0,
      flip: false,
      scale: 1,
      height: child.height * scale,
      outlined: false,
      booleans: [],
      dash: (child.dash ?? []).map((value) => value * scale),
      dashOffset: (child.dashOffset ?? 0) * scale,
    };
  });
};

const EPSILON = 1e-9;
const side = (from, to, v) => {
  const cross = (to.x - from.x) * v.y - (to.y - from.y) * v.x;
  return Math.abs(cross) < EPSILON ? 0 : Math.sign(cross);
};

/**
 * Sommets de silhouette d'un contour extrudé le long de `v` : là où le contour
 * cesse d'avancer d'un côté de `v` pour repartir de l'autre. Leurs arêtes de
 * flanc bordent le volume vu de biais. Les deux bouts d'un contour ouvert en
 * sont toujours.
 */
export const silhouette = (points, closed, v) => {
  const n = points.length;
  if (n < 2) return n === 1 ? [0] : [];
  const edge = (i) => side(points[i], points[(i + 1) % n], v);
  return points
    .map((_, i) => i)
    .filter((i) => {
      if (!closed && (i === 0 || i === n - 1)) return true;
      const [before, after] = [edge((i - 1 + n) % n), edge(i)];
      if (before === 0 && after === 0) return false;
      return before * after <= 0;
    });
};

/* Au-delà, une pointe d'étoile décalée partirait en flèche. */
const MITER_LIMIT = 4;

/**
 * Contour fermé décalé de `distance` vers l'extérieur (négatif : vers
 * l'intérieur), par sommet, en onglet borné. Sert aux deux bords d'un contour
 * double, posés à l'écran de part et d'autre du tracé. Ouvert (`closed`
 * faux), chaque bout suit la normale de sa seule arête.
 */
export const offsetPolygon = (points, distance, closed = true) => {
  const n = points.length;
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % n];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const sign = area >= 0 ? 1 : -1;
  const normal = (a, b) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (sign * (b.y - a.y)) / length, y: (-sign * (b.x - a.x)) / length };
  };
  return points.map((p, i) => {
    const [before, after] = [
      closed || i > 0 ? normal(points[(i - 1 + n) % n], p) : normal(p, points[i + 1]),
      closed || i < n - 1 ? normal(p, points[(i + 1) % n]) : normal(points[i - 1], p),
    ];
    const sum = { x: before.x + after.x, y: before.y + after.y };
    const length = Math.hypot(sum.x, sum.y) || 1;
    const miter = { x: sum.x / length, y: sum.y / length };
    const reach = distance / Math.max(miter.x * after.x + miter.y * after.y, 1 / MITER_LIMIT);
    return { x: p.x + miter.x * reach, y: p.y + miter.y * reach };
  });
};

/**
 * Bord `edge` d'un tracé ouvert `path` décalé de `distance`, sans ses boucles :
 * là où le tracé tourne plus serré que le décalage, le bord intérieur
 * rebrousse chemin et se recoupe (queue d'aronde). La boucle se ramène à son
 * point de croisement — l'enveloppe du trait, comme le dessine un trait SVG.
 * Même nombre de sommets (les rangs des coins tiennent). Seules les boucles
 * courtes et rebroussées : deux spires qui se chevauchent restent.
 */
export const untangle = (edge, path, distance) => {
  const n = edge.length;
  const along = [0];
  for (let k = 1; k < n; k++) along.push(along[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y));
  const reversed = (k) =>
    (edge[k + 1].x - edge[k].x) * (path[k + 1].x - path[k].x) + (edge[k + 1].y - edge[k].y) * (path[k + 1].y - path[k].y) < 0;
  const out = [...edge];
  let i = 0;
  while (i < n - 3) {
    let hit = null;
    let back = false;
    for (let j = i + 2; j < n - 1 && along[j] - along[i + 1] <= 4 * Math.abs(distance); j++) {
      back ||= reversed(j - 1);
      const cross = back && crossing(edge[i], edge[i + 1], edge[j], edge[j + 1]);
      if (cross) hit = { j, cross };
    }
    if (!hit) {
      i += 1;
      continue;
    }
    for (let k = i + 1; k <= hit.j; k++) out[k] = hit.cross;
    i = hit.j;
  }
  /* Aux bouts, la boucle reste ouverte : le bout ne suit que la normale de sa
     propre arête. Tout jusqu'au dernier segment rebroussé près du bout se
     ramène au point où le bord repasse la coupe du bout (droite par le bout
     du tracé, en travers) : la coupe reste droite, comme le bout net d'un
     trait SVG. Sans passage, le bout garde sa place sur la coupe et le reste
     se ramène au sommet qui suit ce segment. */
  const window = 4 * Math.abs(distance);
  let [first, last] = [0, n - 2];
  for (let k = 0; k < n - 1 && along[k] <= window; k++) if (reversed(k)) first = k + 1;
  for (let k = n - 2; k >= first && along[n - 1] - along[k + 1] <= window; k--) if (reversed(k)) last = k - 1;
  const cut = (end) => [edge[end], { x: 2 * path[end].x - edge[end].x, y: 2 * path[end].y - edge[end].y }];
  let [head, tail] = [null, null];
  for (let k = 1; k < first; k++) head = crossing(...cut(0), edge[k], edge[k + 1]) ?? head;
  for (let k = n - 2; k > last + 1; k--) tail = crossing(...cut(n - 1), edge[k - 1], edge[k]) ?? tail;
  return out.map((p, k) => {
    if (k < first) return head ?? (k === 0 ? p : out[first]);
    if (k > last + 1) return tail ?? (k === n - 1 ? p : out[last + 1]);
    return p;
  });
};

/* Croisement strict des segments a→b et c→d, ou `null`. */
const crossing = (a, b, c, d) => {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const det = r.x * s.y - r.y * s.x;
  if (Math.abs(det) < EPSILON) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / det;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / det;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + r.x * t, y: a.y + r.y * t } : null;
};

/**
 * Contour double fermé sur un plan 3D : ses deux traits sont décalés dans le
 * repère du plan, puis projetés — deux formes concentriques, dont l'écart
 * s'écrase avec la perspective. `null` hors de ce cas.
 */
export const planeDouble = (child) => {
  const scale = child.scale ?? 1;
  const gap = (child.gap ?? 0) * scale;
  const { points, closed } = outlinePath(child);
  const double = child.outlined && closed && points.length > 2 && child.stroke !== 'none' && child.strokeWidth > 0 && gap > 0;
  if (!double) return null;
  const offset = (child.strokeWidth + gap) / 2;
  return [offset, -offset].map((distance) => offsetPolygon(points, distance));
};

/**
 * Contour double ouvert sur un plan 3D (ruban, ligne, arc, tracé ouvert) : ses
 * deux traits, décalés dans le repère du plan et débouclés, avant projection
 * — l'écart s'écrase avec la perspective, comme celui de `planeDouble`.
 * `null` hors de ce cas (fermé, point, sans écart).
 */
export const planeBand = (child) => {
  const gap = (child.gap ?? 0) * (child.scale ?? 1);
  const { points, closed } = outlinePath(child);
  const band = child.outlined && !closed && points.length > 1 && child.stroke !== 'none' && child.strokeWidth > 0 && gap > 0;
  if (!band) return null;
  const offset = (child.strokeWidth + gap) / 2;
  return [offset, -offset].map((distance) => untangle(offsetPolygon(points, distance, false), points, distance));
};

/**
 * Silhouette opaque d'un volume extrudé de `v` à l'écran, depuis sa face
 * `child.matrix` : ce qu'il cache des formes dessinées avant lui. `solids` =
 * morceaux à peindre (deux faces et une paroi par arête), élargis d'une
 * demi-épaisseur pour couvrir le trait ; `opening` = les deux faces du trou
 * d'un anneau, dont l'intersection laisse voir derrière. `null` pour un
 * contour ouvert, qui n'a pas d'intérieur.
 */
export const occluder = (child, v) => {
  const { points, closed } = outlinePath(child);
  if (!closed || points.length < 3) return null;
  const double = planeDouble(child);
  const screen = (edge) => edge.map((p) => project(child.matrix, p));
  const lift = (edge) => edge.map((p) => ({ x: p.x + v.x, y: p.y + v.y }));
  const half = child.strokeWidth / 2;
  const shell = offsetPolygon(screen(double ? double[0] : points), half);
  const walls = shell.map((p, i) => {
    const q = shell[(i + 1) % shell.length];
    return [p, q, ...lift([q, p])];
  });
  const solids = [shell, lift(shell), ...walls];
  if (!double) return { solids, opening: null };
  const hole = offsetPolygon(screen(double[1]), -half);
  return { solids, opening: [hole, lift(hole)] };
};
