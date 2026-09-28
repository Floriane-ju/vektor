import { extrusion, outlinePath, planeBand, planeDouble, project, silhouette } from './plane.js';
import { SHAPES } from './scene.js';
import { boundsOf, radians } from './math.js';

/*
 * Profondeur réelle dans un calque 3D : suppression des lignes cachées.
 *
 * Toutes les formes d'un calque partagent son plan et sa projection parallèle,
 * donc la profondeur de tout point est exacte et linéaire : un point `p` du
 * plan à la hauteur `h` le long de la normale est à `u·sin(tilt) + h·cos(tilt)`
 * vers le spectateur, `u` = sa position le long de l'axe comprimé par la
 * pente (`planeMatrix`). Chaque volume devient des faces planes (faces du haut
 * et du bas, une paroi par segment) et des chaînes d'arêtes ; chaque segment
 * d'arête perd les morceaux qu'une face couvre à l'écran en étant plus près.
 * L'ordre des formes ne compte plus.
 *
 * ponytail: balayage O(segments × faces) élagué par boîtes — une grille si une
 * spirale à centaines de copies rame. La face qui cache n'est pas élargie de la
 * demi-épaisseur de son trait : une arête cachée s'arrête sur l'axe du trait
 * qui la cache.
 */

const EPSILON = 1e-6;
/* Tronçon de segment (en fraction de sa longueur) trop court pour compter. */
const SPAN_EPSILON = 1e-9;
/* Interstice (px) sous lequel deux passages cachés se rejoignent, et morceau
   visible sous lequel il disparaît. */
const GAP = 0.1;

/* Point du plan à la hauteur `h`, à l'écran, avec sa profondeur `z`. */
const lifter = (child) => {
  const up = extrusion(child.plane, 1);
  const heading = radians(child.plane.heading);
  const along = { x: -Math.sin(heading), y: Math.cos(heading) };
  const [sin, cos] = [Math.sin(radians(child.plane.tilt)), Math.cos(radians(child.plane.tilt))];
  return (points, h) =>
    points.map((p) => {
      const q = project(child.matrix, p);
      return { x: q.x + up.x * h, y: q.y + up.y * h, z: (p.x * along.x + p.y * along.y) * sin + h * cos };
    });
};


const overlaps = (p, q) => p.minX <= q.maxX && q.minX <= p.maxX && p.minY <= q.maxY && q.minY <= p.maxY;

/**
 * Face plane `rings` (contours à l'écran avec profondeur, pair-impair : un
 * anneau a deux contours), sa profondeur en tout point de l'écran
 * `z = A·x + B·y + C`, ou `null` vue par la tranche.
 */
const face = (child, rings, fill, occludes) => {
  const all = rings.flat();
  const [a] = all;
  let b = a;
  for (const p of all) if (Math.hypot(p.x - a.x, p.y - a.y) > Math.hypot(b.x - a.x, b.y - a.y)) b = p;
  let [c, area] = [a, 0];
  for (const p of all) {
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) > Math.abs(area)) [c, area] = [p, cross];
  }
  if (Math.abs(area) < EPSILON) return null;
  const A = ((b.z - a.z) * (c.y - a.y) - (c.z - a.z) * (b.y - a.y)) / area;
  const B = ((c.z - a.z) * (b.x - a.x) - (b.z - a.z) * (c.x - a.x)) / area;
  const depth = all.reduce((sum, p) => sum + p.z, 0) / all.length;
  return { child, rings, box: boundsOf(all), A, B, C: a.z - A * a.x - B * a.y, fill, occludes, depth };
};

/* Coins d'une bande (`planeBand`) fermée en un contour : bouts et coins du
   tracé, sur chacun de ses deux bords. */
const bandCorners = (n, corners) => [...new Set([0, n - 1, ...corners])].flatMap((i) => [i, 2 * n - 1 - i]);

/**
 * Faces et chaînes d'arêtes d'une copie sur un plan 3D. Chaîne = `{ points,
 * closed, kind }` : `outline` (contours des faces, style de la forme) ou
 * `flank` (arête de flanc, bout rond). Volume centré sur le plan.
 */
export const meshOf = (child) => {
  const lift = lifter(child);
  const scale = child.scale ?? 1;
  const height = (child.height ?? 0) * scale;
  const outline = outlinePath(child);
  const occludes = child.opaque !== false;
  const filled = child.fill && child.fill !== 'none' ? child.fill : null;
  const chain = (points, closed, kind = 'outline') => ({ points, closed, kind });

  if (SHAPES[child.type].geometry === 'dot') {
    return { faces: [], chains: [chain([...lift(outline.points, -height / 2), ...lift(outline.points, height / 2)], false, 'axis')] };
  }
  const double = planeDouble(child);
  const band = double ? null : planeBand(child);

  if (!height) {
    const loops = double ?? band ?? [outline.points];
    const area = double ? [double[1]] : band ? [[...band[0], ...[...band[1]].reverse()]] : outline.closed ? [outline.points] : null;
    const flat = filled && area ? face(child, area.map((ring) => lift(ring, 0)), filled, occludes) : null;
    return {
      faces: flat ? [flat] : [],
      chains: loops.map((points) => chain(lift(points, 0), double ? true : band ? false : outline.closed)),
    };
  }

  const rings = double
    ? double.map((points, r) => ({ points, closed: true, corners: child.rims?.[r].corners ?? outline.corners }))
    : band
      ? [{ points: [...band[0], ...[...band[1]].reverse()], closed: true, corners: bandCorners(outline.points.length, outline.corners) }]
      : [outline];
  const v = extrusion(child.plane, height);
  const sides = child.plane.sides === 'filled' ? child.stroke : null;
  const faces = [];
  const chains = [];
  const levels = rings.map(({ points }) => [lift(points, -height / 2), lift(points, height / 2)]);
  /* Face du bas toujours tournée vers le fond : elle cache, sans aplat qui
     déborderait sous des flancs transparents. */
  if (rings[0].closed) {
    faces.push(face(child, levels.map((level) => level[0]), null, occludes));
    faces.push(face(child, levels.map((level) => level[1]), filled ?? sides, occludes));
  }
  rings.forEach(({ closed, corners }, r) => {
    const [bottom, top] = levels[r];
    const n = bottom.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      faces.push(face(child, [[bottom[i], bottom[j], top[j], top[i]]], sides, occludes));
    }
    chains.push(chain(bottom, closed), chain(top, closed));
    for (const k of new Set([...silhouette(bottom, closed, v), ...corners])) chains.push(chain([bottom[k], top[k]], false, 'flank'));
  });
  return { faces: faces.filter(Boolean), chains };
};

/* Paramètres où le segment a→b croise les bords des contours. */
const crossings = (a, b, rings) => {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const ts = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [c, d] = [ring[i], ring[(i + 1) % ring.length]];
      const s = { x: d.x - c.x, y: d.y - c.y };
      const det = r.x * s.y - r.y * s.x;
      if (Math.abs(det) < 1e-12) continue;
      const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / det;
      const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / det;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  return ts;
};

/* Point dans les contours, pair-impair. */
const contains = (rings, p) => {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [q, s] = [ring[i], ring[j]];
      if (q.y > p.y !== s.y > p.y && p.x < ((s.x - q.x) * (p.y - q.y)) / (s.y - q.y) + q.x) inside = !inside;
    }
  }
  return inside;
};

/* Passages [t0, t1] du segment a→b cachés par `face` : dedans à l'écran et
   la face plus près. */
const hiddenBy = (a, b, face) => {
  const gap = (p) => face.A * p.x + face.B * p.y + face.C - p.z;
  const [f0, f1] = [gap(a), gap(b)];
  if (f0 <= EPSILON && f1 <= EPSILON) return [];
  let [lo, hi] = [0, 1];
  if (f0 <= EPSILON) lo = (EPSILON - f0) / (f1 - f0);
  if (f1 <= EPSILON) hi = (EPSILON - f0) / (f1 - f0);
  const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const cuts = [lo, ...crossings(a, b, face.rings).filter((t) => t > lo && t < hi), hi].sort((p, q) => p - q);
  const spans = [];
  for (let k = 1; k < cuts.length; k++) {
    if (cuts[k] - cuts[k - 1] > SPAN_EPSILON && contains(face.rings, at((cuts[k] + cuts[k - 1]) / 2))) spans.push([cuts[k - 1], cuts[k]]);
  }
  return spans;
};

/* Morceaux visibles [u0, u1] du segment a→b. */
const visiblePieces = (a, b, faces) => {
  const reach = boundsOf([a, b]);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const gap = length > 0 ? GAP / length : 0;
  const hidden = faces
    .filter((one) => overlaps(reach, one.box))
    .flatMap((one) => (length > 0 ? hiddenBy(a, b, one) : contains(one.rings, a) && one.A * a.x + one.B * a.y + one.C - a.z > EPSILON ? [[0, 1]] : []))
    .sort(([p], [q]) => p - q);
  const pieces = [];
  let from = 0;
  for (const [t0, t1] of hidden) {
    if (t0 > from + gap) pieces.push([from, t0]);
    from = Math.max(from, t1);
  }
  if (from < 1 - gap || (length === 0 && from === 0)) pieces.push([from, 1]);
  return pieces;
};

/* Morceaux visibles d'une chaîne, recousus en tracés continus. */
const visibleRuns = ({ points, closed }, faces) => {
  const n = points.length;
  const count = closed ? n : n - 1;
  const runs = [];
  let open = null;
  for (let i = 0; i < count; i++) {
    const [a, b] = [points[i], points[(i + 1) % n]];
    const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const carried = open;
    open = null;
    for (const [u0, u1] of visiblePieces(a, b, faces)) {
      const run = carried && u0 === 0 ? carried : runs[runs.push([at(u0)]) - 1];
      run.push(at(u1));
      if (u1 === 1) open = run;
    }
  }
  /* Fermé : le dernier morceau rejoint le premier au sommet 0. */
  if (closed && runs.length > 1 && open && open !== runs[0] && runs[0][0].x === points[0].x && runs[0][0].y === points[0].y) {
    runs[0] = [...runs.pop(), ...runs[0].slice(1)];
  }
  return runs;
};

/**
 * Calque 3D entier : `fills` = faces peintes, de la plus loin à la plus proche,
 * `shapes` = par copie, ses morceaux d'arêtes visibles — `outlines` (contours,
 * style de la forme), `flanks` (arêtes de flanc) et `axis` (point extrudé).
 * Une face « Opaque » éteinte (fil de fer) ne cache rien, pas même son volume.
 *
 * ponytail: aplats au peintre, face par face — deux faces remplies qui se
 * traversent peuvent se chevaucher mal ; les traits, eux, sont exacts.
 */
export const hiddenLines = (children) => {
  const meshes = children.map((child) => ({ child, ...meshOf(child) }));
  const faces = meshes.flatMap((mesh) => mesh.faces);
  const occluders = faces.filter((one) => one.occludes);
  const runsOf = (chains, kind) => chains.filter((one) => one.kind === kind).flatMap((one) => visibleRuns(one, occluders));
  return {
    fills: faces.filter((one) => one.fill).sort((p, q) => p.depth - q.depth),
    shapes: meshes.map(({ child, chains }) => ({
      child,
      outlines: runsOf(chains, 'outline'),
      flanks: runsOf(chains, 'flank'),
      axis: runsOf(chains, 'axis'),
    })),
  };
};
