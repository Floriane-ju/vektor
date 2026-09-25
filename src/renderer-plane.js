import {
  extrusion,
  facingAway,
  flushCorner,
  nearRuns,
  occluder,
  offsetPolygon,
  outlinePath,
  planeBand,
  planeDouble,
  project,
  sheet,
  shifted,
  silhouette,
} from './plane.js';
import { createNode, maskId, MASK_REGION, round, svgNode } from './renderer-svg.js';
import { SHAPES } from './scene.js';

/*
 * Rendu des formes sur un plan 3D : contour double en perspective, volume
 * extrudé et occlusion entre volumes. Le renderer principal y délègue ; les
 * fonctions ne tournent qu'au rendu, donc l'import croisé avec
 * `renderer-svg.js` est sans risque.
 */

/* Chaque bord en tracé fermé, relatif au centre et déjà placé ; le fond se
   peint à l'intérieur du bord intérieur, le séparateur reste vide. Ouvert
   (`planeBand`), deux traits ouverts, l'aplat sous eux sans trait. */
export const createPlaneDouble = (child, [outer, inner], closed = true) => {
  const scale = child.scale ?? 1;
  const edge = (points, fill) =>
    createNode({
      ...child,
      type: 'polyline',
      points: points.map((p) => ({ x: p.x - child.x, y: p.y - child.y })),
      closed,
      rotation: 0,
      flip: false,
      scale: 1,
      outlined: false,
      fill,
      /* Tirets suivis de l'échelle de la copie, comme sur la forme. */
      dash: (child.dash ?? []).map((value) => value * scale),
    });
  const group = svgNode('g');
  group.dataset.elementId = child.id;
  const nodes = closed
    ? [edge(outer, 'none'), edge(inner, child.fill)]
    : [...(child.fill === 'none' ? [] : [createNode({ ...child, outlined: false, stroke: 'none' })]), edge(outer, 'none'), edge(inner, 'none')];
  for (const node of nodes) delete node.dataset.elementId;
  group.append(...nodes);
  return group;
};

/**
 * Forme dessinée : extrudée si son calque a un plan 3D et qu'elle a une
 * hauteur, sinon le nœud simple.
 */
export const createShape = (child, others = []) => {
  const v = extrusionOf(child);
  if (!v) return createNode(child);
  return createExtrusion(centred(child, v), v, others);
};

const extrusionOf = (child) => {
  const v = child.plane && child.height ? extrusion(child.plane, child.height * (child.scale ?? 1)) : null;
  return v && Math.hypot(v.x, v.y) > 1e-6 ? v : null;
};

/* Centrée sur le plan : une profondeur de 10 va de -5 à 5. */
const centred = (child, v) => ({ ...child, matrix: shifted(child.matrix, { x: -v.x / 2, y: -v.y / 2 }) });

/* Contour du bas à l'écran d'une copie déjà centrée : bande d'un contour
   double ouvert, sinon le contour projeté. */
const volumeOf = (child) => {
  const outline = outlinePath(child);
  const dot = SHAPES[child.type].geometry === 'dot';
  const width = child.strokeWidth * (dot ? (child.scale ?? 1) : 1);
  const flat = outline.points.map((p) => project(child.matrix, p));
  const band = openBand(child, outline, flat);
  return { ...(band ?? { ...outline, base: flat }), band, dot, width };
};

/* Volume qui se cache lui-même (ruban, tracé ouvert, étoile, tracé fermé
   creux), hors anneau : ses parois proches cachent les lointaines. */
const hidesItself = (child, { band, closed, dot, base }) =>
  !planeDouble(child) && Boolean(band || (!closed && !dot) || (closed && !convex(base)));

/**
 * Parois des volumes qui se cachent eux-mêmes, pour qu'ils se cachent aussi
 * l'un l'autre (rubans d'une spirale répétée en axial) : `Map` copie →
 * `{ base, closed }` des autres volumes de même extrusion à l'écran — même
 * projection parallèle, donc même découpe qu'entre ses propres parois.
 *
 * ponytail: volumes d'un même calque et de même profondeur seulement ; entre
 * profondeurs ou calques différents, l'ordre de dessin reste la règle.
 */
export const wallNeighbours = (children) => {
  const groups = new Map();
  for (const child of children) {
    const v = extrusionOf(child);
    if (!v) continue;
    const volume = volumeOf(centred(child, v));
    if (!hidesItself(child, volume)) continue;
    const key = `${round(v.x)},${round(v.y)},${child.height > 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([child, { base: volume.base, closed: volume.closed }]);
  }
  const neighbours = new Map();
  for (const members of groups.values()) {
    for (const [child] of members) neighbours.set(child, members.filter(([other]) => other !== child).map(([, wall]) => wall));
  }
  return neighbours;
};

/* Contour déjà à l'écran en données `d`. */
const screenPath = (points, closed) =>
  `M${points.map((p) => `${round(p.x)},${round(p.y)}`).join(' L')}${closed ? ' Z' : ''}`;

const moved = (points, by) => points.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));

/* Masque d'extrusion : `keep` = 'out' cache l'aire donnée, 'in' ne garde qu'elle. */
const areaMask = (child, d, keep) => {
  const mask = svgNode('mask', { id: maskId(`extrude-${child.id}`), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  const [outside, inside] = keep === 'out' ? ['#fff', '#000'] : ['#000', '#fff'];
  mask.append(svgNode('rect', { ...MASK_REGION, fill: outside }), svgNode('path', { d, fill: inside, stroke: 'none' }));
  return mask;
};

/**
 * Volume d'une forme extrudée de `v` à l'écran : face arrière, arêtes de flanc
 * (silhouette et sommets anguleux) et, en flancs colorés, l'aplat du volume —
 * le tout masqué par l'aire de la face avant, dessinée par-dessus. La face
 * avant est celle du haut : décalée de `v` pour une hauteur positive, la
 * base pour une hauteur négative. `createShape` a déjà descendu la base d'une
 * demi-profondeur : le volume est centré sur le plan.
 *
 * Un contour double fermé est un anneau : son bord extérieur se comporte comme
 * un prisme plein, son bord intérieur comme un trou — sa face arrière et ses
 * flancs ne se voient qu'à travers l'ouverture de la face avant. Les deux
 * bords sont ceux de `planeDouble`, décalés dans le plan.
 *
 * ponytail: une forme simple est un prisme plein — un trou (pair-impair,
 * découpe) cache comme du plein — et il n'y a pas d'occlusion entre formes
 * (ordre de dessin). Arêtes cachées d'un anneau en trait plein, sans tirets.
 * Un masque par copie ; mutualiser si des centaines de copies pèsent.
 */
/**
 * Bande d'un contour double ouvert, à l'écran : l'axe de chacun de ses deux
 * traits (`planeBand`, décalés dans le plan), l'un à l'aller, l'autre au retour, en
 * un contour fermé. Ses coins sont ceux du tracé sur chaque trait. `null`
 * hors de ce cas.
 * Ses bouts se ferment, en haut comme au fond : c'est un volume.
 */
const openBand = (child, { corners }, flat) => {
  const edges = planeBand(child);
  if (!edges) return null;
  const [left, right] = edges.map((edge) => edge.map((p) => project(child.matrix, p)));
  const n = flat.length;
  return {
    base: [...left, ...right.reverse()],
    closed: true,
    corners: [...new Set([0, n - 1, ...corners])].flatMap((i) => [i, 2 * n - 1 - i]),
  };
};

/* Marge (px) sous laquelle un point est sur le bord d'une paroi, pas dedans. */
const WITHIN = 1e-6;
const EPSILON = 1e-9;

/* Portion [t0, t1] du segment a→b strictement à l'intérieur du
   parallélogramme `quad` (convexe), ou `null`. Un segment qui ne fait que
   longer un bord ou toucher un coin n'y entre pas. */
const within = (a, b, quad) => {
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const sign = Math.sign(turn(quad[0], quad[1], quad[2]) + turn(quad[0], quad[2], quad[3]));
  if (sign === 0) return null;
  let [t0, t1] = [0, 1];
  for (let k = 0; k < 4; k++) {
    const [p, q] = [quad[k], quad[(k + 1) % 4]];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length < EPSILON) continue;
    /* Distance signée au bord, positive dedans : f0 + f1·t. */
    const f0 = (sign * turn(p, q, a)) / length;
    const f1 = (sign * turn(p, q, b)) / length - f0;
    if (Math.abs(f1) < EPSILON) {
      if (f0 <= WITHIN) return null;
      continue;
    }
    const t = (WITHIN - f0) / f1;
    if (f1 > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t1 - t0 <= EPSILON) return null;
  }
  return [t0, t1];
};

/**
 * Parois d'un volume qui peut se cacher lui-même (ruban, tracé ouvert, étoile,
 * tracé fermé creux) : arêtes du fond et de flanc, découpées par la géométrie
 * et tracées dans un masque qui découpe un aplat de la couleur du trait ; la
 * face avant efface en dernier (bande), son contour se dessine par-dessus.
 * `base` = contour du bas à l'écran, `edges` = sommets dont l'arête de flanc
 * se voit, `corners` = vrais coins.
 *
 * Projection parallèle : un point d'arête est caché exactement quand une
 * paroi passe devant lui à l'écran, plus près de la face avant. Le fond, au
 * niveau le plus loin, l'est dès qu'il tombe dans une paroi. Plus d'ordre du
 * peintre : peint paroi par paroi, chaque aplat rognait le trait de ses
 * voisines — dents de scie sur le fond, flancs amincis.
 *
 * ponytail: découpe en O(n²) arête × paroi, sans index spatial, et contre
 * toutes les copies voisines (`others`) — quelques centaines de sommets en
 * tout ; un index par boîtes si une spirale à dizaines de copies rame.
 */
const createWalls = (child, { base, closed, edges, corners, v, up, width, others = [] }) => {
  const n = base.length;
  const [backShift, frontShift] = up ? [{ x: 0, y: 0 }, v] : [v, { x: 0, y: 0 }];
  /* Parois des autres volumes (`wallNeighbours`) : elles cachent tout ce
     qu'elles couvrent, sans exception de voisinage. */
  const foreign = others.flatMap((other) =>
    Array.from({ length: other.closed ? other.base.length : other.base.length - 1 }, (_, i) => [
      other.base[i],
      other.base[(i + 1) % other.base.length],
    ]),
  );
  /* Bouts ronds : une coupure tombe sur un bord de paroi, tracé de la même
     épaisseur, qui recouvre le rond ; au pli, le fond rejoint l'arête de flanc. */
  const line = (d) => svgNode('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': round(width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const segments = Array.from({ length: closed ? n : n - 1 }, (_, i) => [i, (i + 1) % n]);
  const pairs = [...segments.map(([i, j]) => [base[i], base[j]]), ...foreign];
  const quads = pairs.map(([a, b]) => [a, b, { x: b.x + v.x, y: b.y + v.y }, { x: a.x + v.x, y: a.y + v.y }]);
  const back = backRuns(moved(base, backShift), segments, quads, { closed, corners: new Set(corners) });
  const flanks = edges.flatMap((k) => flankRuns(base[k], pairs, v, up));
  /* Face du haut d'un autre volume : devant toutes les arêtes. */
  const fronts = [...(closed ? [base] : []), ...others.filter((other) => other.closed).map((other) => other.base)];
  const mask = svgNode('mask', { id: maskId(`walls-${child.id}`), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  mask.dataset.walls = '';
  mask.append(
    svgNode('rect', { ...MASK_REGION, fill: '#000' }),
    ...[back, flanks].filter((runs) => runs.length).map((runs) => line(runs.map((run) => screenPath(run, false)).join(' '))),
    ...fronts.map((front) => svgNode('path', { d: screenPath(moved(front, frontShift), true), fill: '#000', stroke: 'none' })),
  );
  const paint = svgNode('rect', { ...MASK_REGION, fill: child.stroke, opacity: round(child.opacity ?? 1), mask: `url(#${mask.id})` });
  return [mask, paint];
};

/* Morceaux visibles de l'arête de flanc du sommet `foot`, de `foot` à
   `foot + v`. Son point de hauteur t tombe, à l'écran, sur la paroi d'un
   segment a→b (e = b − a) à la hauteur t + c (d = foot − a = s·e + c·v) :
   caché si ce point de paroi est plus près de la face avant (c > 0 quand elle
   est en haut, c < 0 en bas). Les parois qui partent du sommet ne le cachent pas. */
const flankRuns = (foot, pairs, v, up) => {
  const cross = (p, q) => p.x * q.y - p.y * q.x;
  const hidden = pairs
    .flatMap(([a, b]) => {
      const e = { x: b.x - a.x, y: b.y - a.y };
      const d = { x: foot.x - a.x, y: foot.y - a.y };
      const det = cross(e, v);
      if (Math.abs(det) < EPSILON) return [];
      const [s, c] = [cross(d, v) / det, cross(e, d) / det];
      if (s <= WITHIN || s >= 1 - WITHIN || (up ? c <= WITHIN : c >= -WITHIN)) return [];
      const [t0, t1] = [Math.max(0, -c), Math.min(1, 1 - c)];
      return t1 - t0 > EPSILON ? [[t0, t1]] : [];
    })
    .sort(([p], [q]) => p - q);
  const at = (t) => ({ x: foot.x + v.x * t, y: foot.y + v.y * t });
  const gap = GAP / (Math.hypot(v.x, v.y) || 1);
  const runs = [];
  let from = 0;
  for (const [t0, t1] of hidden) {
    if (t0 > from + gap) runs.push([at(from), at(t0)]);
    from = Math.max(from, t1);
  }
  if (from < 1 - gap) runs.push([at(from), at(1)]);
  return runs;
};

/* Morceaux visibles du bord du fond `edge` : chaque segment privé de ses
   passages à l'intérieur des parois `quads`, les morceaux contigus recousus
   en un tracé. Ni sa paroi ni ses voisines ne le cachent, sauf par un coin :
   le long d'une courbe, la voisine, presque plate au pli, le rognait juste
   avant l'arête de flanc. Deux parois bord à bord ne laissent pas passer de
   miette entre elles (`GAP`). */
const backRuns = (edge, segments, quads, { closed, corners }) => {
  const count = segments.length;
  const neighbour = (s, k) => {
    const shared = k === (s + 1) % count && (closed || k > s) ? segments[s][1] : k === (s - 1 + count) % count && (closed || k < s) ? segments[s][0] : null;
    return shared !== null && !corners.has(shared);
  };
  const runs = [];
  let open = null;
  segments.forEach(([i, j], s) => {
    const [a, b] = [edge[i], edge[j]];
    const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const gap = GAP / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    const hidden = quads
      .flatMap((quad, k) => (k === s || neighbour(s, k) ? [] : [within(a, b, quad)]))
      .filter(Boolean)
      .sort(([p], [q]) => p - q);
    /* Complément des passages cachés dans [0, 1]. */
    const pieces = [];
    let from = 0;
    for (const [t0, t1] of hidden) {
      if (t0 > from + gap) pieces.push([from, t0]);
      from = Math.max(from, t1);
    }
    if (from < 1 - gap) pieces.push([from, 1]);
    const carried = open;
    open = null;
    for (const [u0, u1] of pieces) {
      const run = carried && u0 === 0 ? carried : runs[runs.push([at(u0)]) - 1];
      run.push(at(u1));
      if (u1 === 1) open = run;
    }
  });
  /* Fermé : le dernier morceau rejoint le premier au sommet 0. */
  if (closed && runs.length > 1 && open && open !== runs[0] && runs[0][0].x === edge[0].x && runs[0][0].y === edge[0].y) {
    runs[0] = [...runs.pop(), ...runs[0].slice(1)];
  }
  return runs;
};
/* Interstice (px) entre deux passages cachés en dessous duquel ils se rejoignent. */
const GAP = 0.1;

/* Contour fermé sans creux : tous ses virages tournent du même côté. */
const convex = (points) => {
  const n = points.length;
  const turns = points.map((p, i) => {
    const [q, r] = [points[(i + 1) % n], points[(i + 2) % n]];
    const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    return Math.abs(cross) < 1e-9 ? 0 : Math.sign(cross);
  });
  return !(turns.includes(1) && turns.includes(-1));
};

const createExtrusion = (child, v, others = []) => {
  const up = child.height > 0;
  const lifted = { ...child, matrix: shifted(child.matrix, v) };
  const [front, back] = up ? [lifted, child] : [child, lifted];
  const [frontShift, backShift] = up ? [v, { x: 0, y: 0 }] : [{ x: 0, y: 0 }, v];
  /* Contour double ouvert : un volume plein, la bande entre ses deux traits.
     Il se traite comme un contour fermé — face du haut et parois cachent le
     fond et les arêtes de derrière. */
  const shape = volumeOf(child);
  const { base, closed, corners, band, dot, width } = shape;
  /* Anneau : les deux bords du contour double, décalés dans le plan puis projetés. */
  const double = planeDouble(child);
  const ring = Boolean(double);
  const [outer, inner] = double ? double.map((edge) => edge.map((p) => project(child.matrix, p))) : [base, null];
  /* Sens de la face arrière vers la face avant. */
  const toward = { x: frontShift.x - backShift.x, y: frontShift.y - backShift.y };
  /* Fond d'un contour fermé : la moitié que la paroi ne cache pas — côté
     proche pour un volume plein (`sign` = 1), côté loin pour un trou (-1), vu
     par l'ouverture. Chaque morceau finit sur la silhouette et s'y prolonge
     d'un seul tracé : arête de flanc jusqu'à la face avant, puis un bout du
     bord voisin de cette face, pour que les deux coins se joignent en onglet.
     L'arête affleure le bord du trait côté volume (`flushCorner`). */
  const chain = (contour, sign) => {
    const n = contour.length;
    const rim = offsetPolygon(contour, (sign * width) / 2);
    const flush = (i, j) => flushCorner(contour[i], contour[j], rim[i], v, width);
    const lead = (i, j) => ({ x: (contour[i].x + contour[j].x) / 2, y: (contour[i].y + contour[j].y) / 2 });
    const at = (p, by) => ({ x: p.x + by.x, y: p.y + by.y });
    const direction = sign > 0 ? toward : { x: -toward.x, y: -toward.y };
    return nearRuns(contour, direction)
      .map((run) => {
        if (run[0] === run.at(-1)) return screenPath(moved(run.map((i) => contour[i]), backShift), false);
        const [first, last] = [run[0], run.at(-1)];
        const [before, after] = [(first - 1 + n) % n, (last + 1) % n];
        const middle = run.slice(1, -1).map((i) => at(contour[i], backShift));
        return screenPath(
          [
            at(lead(first, before), frontShift),
            at(flush(first, before), frontShift),
            at(flush(first, run[1]), backShift),
            ...middle,
            at(flush(last, run.at(-2)), backShift),
            at(flush(last, after), frontShift),
            at(lead(last, after), frontShift),
          ],
          false,
        );
      })
      .join(' ');
  };

  /* `linecap` : les arêtes de flanc finissent dans un coin ; rond, le bout
     se loge dans l'onglet du coin au lieu d'y laisser une encoche. */
  const stroked = (d, dashed = false, linecap = child.linecap ?? 'butt') => {
    if (!d.trim()) return null;
    const node = svgNode('path', {
      d,
      fill: 'none',
      stroke: child.stroke,
      'stroke-width': round(width),
      'stroke-opacity': round(child.opacity ?? 1),
      'stroke-linecap': dot ? 'round' : linecap,
    });
    /* Tirets comme `createNode` : multiples de l'épaisseur, suivis de l'échelle. */
    if (dashed && child.dash?.length) {
      node.setAttribute('stroke-dasharray', child.dash.map((value) => round(value * width * (child.scale ?? 1))).join(' '));
    }
    return node;
  };
  /* Arêtes de flanc d'un contour, d'une face à l'autre. Fermé (`sign`), la
     silhouette part déjà avec le fond (`chain`) : ne restent que les coins de
     la paroi visible, dont les deux arêtes sont du côté vu. Ouvert : silhouette
     et coins. */
  const sides = (contour, sign = 0) => {
    const seen = sign ? facingAway(contour, sign > 0 ? toward : { x: -toward.x, y: -toward.y }) : null;
    const edges = sign
      ? corners.filter((i) => seen[i] && seen[(i - 1 + contour.length) % contour.length])
      : [...new Set([...silhouette(contour, closed, v), ...corners])];
    return edges
      .map((i) => screenPath([contour[i], { x: contour[i].x + v.x, y: contour[i].y + v.y }], false))
      .join(' ');
  };

  const group = svgNode('g');
  group.dataset.elementId = child.id;
  const volume = svgNode('g');
  if (child.plane.sides === 'filled') {
    const quads = outer.slice(0, closed ? outer.length : -1).map((p, i) => {
      const q = outer[(i + 1) % outer.length];
      return screenPath([p, q, { x: q.x + v.x, y: q.y + v.y }, { x: p.x + v.x, y: p.y + v.y }], true);
    });
    const faces = closed ? [screenPath(outer, true), screenPath(moved(outer, v), true)] : [];
    /* Opacité sur le groupe : les quads qui se recouvrent ne se foncent pas.
       Un nœud par morceau : réunis, leurs sens de parcours s'annuleraient. */
    const tint = svgNode('g', { opacity: round(child.opacity ?? 1), fill: child.stroke, stroke: 'none' });
    tint.append(...[...faces, ...quads].map((d) => svgNode('path', { d })));
    volume.append(tint);
  }
  if (ring) {
    volume.append(...[stroked(chain(outer, 1)), stroked(sides(outer, 1), false, 'round')].filter(Boolean));
    /* Le trou : face arrière et flancs intérieurs, vus par l'ouverture seule. */
    const hole = svgNode('g');
    hole.append(...[stroked(chain(inner, -1)), stroked(sides(inner, -1), false, 'round')].filter(Boolean));
    const opening = areaMask(child, screenPath(moved(inner, frontShift), true), 'in');
    hole.setAttribute('mask', `url(#${opening.id})`);
    /* Hors du volume : le masque de la face avant cacherait l'ouverture. */
    group.append(opening, hole);
  } else if (hidesItself(child, shape)) {
    /* Ruban, tracé ouvert, étoile, tracé fermé creux : ses parois proches
       cachent les lointaines, ce que la moitié proche du fond ignore. */
    const edges = [...new Set([...silhouette(base, closed, v), ...corners])];
    const [mask, paint] = createWalls(child, { base, closed, edges, corners, v, up, width, others });
    group.append(mask);
    volume.append(paint);
  } else if (closed) {
    volume.append(...[stroked(chain(base, 1), true), stroked(sides(base, 1), false, 'round')].filter(Boolean));
  } else {
    const hidden = createNode(back);
    delete hidden.dataset.elementId;
    volume.append(...[hidden, stroked(sides(base), false, 'round')].filter(Boolean));
  }
  /* Un contour ouvert (ligne, arc, point) n'a pas d'aire : rien ne se cache. */
  if (closed) {
    const mask = areaMask(child, screenPath(moved(outer, frontShift), true), 'out');
    volume.setAttribute('mask', `url(#${mask.id})`);
    group.append(mask);
  }
  /* Bande : le haut est son contour fermé, bouts compris — le trait évidé n'y
     a pas de bord, et le volume paraîtrait ouvert au-dessus seulement. */
  const face = band ? stroked(screenPath(moved(base, frontShift), true), true) : createNode(front);
  delete face.dataset.elementId;
  /* Coins des bouts souvent aigus à l'écran : en onglet, une pointe dépasse
     l'arête de flanc ; ronds, ils s'y raccordent comme son bout rond. */
  if (band) face.setAttribute('stroke-linejoin', 'round');
  group.append(volume, face);
  return group;
};


/**
 * Silhouette opaque d'une forme extrudée (`occluder`), ou `null`. Hôte d'une
 * forme logée `guest`, un contour ouvert a aussi la sienne : ses parois devant
 * la forme (`sheet`), sur toutes ses copies propres `copies` — les rubans
 * d'une spirale répétée en axial la cachent tous.
 */
export const shapeOccluder = (child, guest = null, copies = [child]) => {
  const v = extrusionOf(child);
  if (!v) return null;
  const base = centred(child, v);
  const solid = occluder(base, v);
  if (solid || !guest) return solid;
  const foot = project(base.matrix, guest);
  const sheets = copies
    .map((copy) => {
      const w = extrusionOf(copy);
      return w && sheet(centred(copy, w), w, foot);
    })
    .filter(Boolean);
  return sheets.length
    ? { ...sheets[0], solids: sheets.flatMap((one) => one.solids), clip: sheets.flatMap((one) => one.clip) }
    : null;
};

/**
 * Masque « derrière ce volume » : blanc partout, noir sur sa silhouette, blanc
 * de nouveau dans ce qu'on voit à travers son trou. `next` = masque des
 * volumes dessinés après lui, qu'il compose (produit) : une forme ne porte que
 * le masque du premier volume qui la suit.
 */
const createOcclusion = ({ solids, opening, width, clip }, next) => {
  const mask = svgNode('mask', { id: maskId('occlude'), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  const content = svgNode('g', next ? { mask: `url(#${next})` } : {});
  /* Paroi d'un volume ouvert (`width`) : son trait couvre l'épaisseur de la bande. */
  const shadow = svgNode('g', width
    ? { fill: '#000', stroke: '#000', 'stroke-width': round(width), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }
    : { fill: '#000', stroke: 'none' });
  /* Un nœud par morceau : réunis, leurs sens de parcours s'annuleraient. */
  shadow.append(...solids.map((points) => svgNode('path', { d: screenPath(points, true) })));
  content.append(svgNode('rect', { ...MASK_REGION, fill: '#fff' }));
  if (clip) {
    /* Bornée par la silhouette du volume ouvert : un nœud par morceau, réunis. */
    const bound = svgNode('clipPath', { id: maskId('silhouette') });
    bound.append(...clip.map((points) => svgNode('path', { d: screenPath(points, true) })));
    shadow.setAttribute('clip-path', `url(#${bound.id})`);
    content.append(bound);
  }
  content.append(shadow);
  if (opening) {
    const clip = svgNode('clipPath', { id: maskId('opening') });
    clip.append(svgNode('path', { d: screenPath(opening[1], true) }));
    content.append(clip, svgNode('path', { d: screenPath(opening[0], true), fill: '#fff', 'clip-path': `url(#${clip.id})` }));
  }
  mask.append(content);
  return mask;
};

/**
 * Occlusion entre volumes, dans l'ordre de dessin : chaque nœud est masqué par
 * les volumes dessinés après lui. `nodes` = nœuds de dessin dans l'ordre,
 * `occluders` = silhouette de ceux qui en ont une. Les masques vont dans `defs`.
 *
 * ponytail: l'ordre de l'arbre fait la profondeur, pas le z réel — une forme
 * est entièrement devant ou derrière un volume. Un masque par volume, chaînés.
 */
export const occlude = (nodes, occluders, defs) => {
  let next = null;
  for (const node of [...nodes].reverse()) {
    if (next) {
      const holder = svgNode('g', { mask: `url(#${next})` });
      node.replaceWith(holder);
      holder.append(node);
    }
    const shape = occluders.get(node);
    if (!shape) continue;
    const mask = createOcclusion(shape, next);
    defs.append(mask);
    next = mask.id;
  }
};

/* Masque qui ne garde que l'ouverture du dessus d'un anneau. */
const createOpening = ([, top]) => {
  const mask = svgNode('mask', { id: maskId('inside'), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  mask.append(svgNode('rect', { ...MASK_REGION, fill: '#000' }), svgNode('path', { d: screenPath(top, true), fill: '#fff' }));
  return mask;
};

/**
 * Forme logée dans le volume `host` (silhouette `hostShape`) : tranchée selon
 * la profondeur de l'hôte, chaque tranche dessinée comme un volume à part.
 * - au-dessus de l'hôte : devant lui, sans masque ;
 * - dans son épaisseur : vue par l'ouverture du dessus d'un anneau seule,
 *   invisible dans un volume plein ;
 * - en dessous : derrière lui, vue autour et à travers le trou.
 * Une forme plate est tout entière dans l'épaisseur. Les masques vont dans `defs`.
 *
 * ponytail: un volume logé montre une arête à chaque coupe ; les fondre le
 * jour où l'on loge autre chose qu'un axe.
 */
export const createInside = (child, host, hostShape, defs) => {
  const scale = child.scale ?? 1;
  const depth = (child.height ?? 0) * scale;
  const half = ((host.height ?? 0) * (host.scale ?? 1)) / 2;
  const slices = depth === 0
    ? [['middle', 0, 0]]
    : [
        ['below', -depth / 2, Math.min(depth / 2, -half)],
        ['middle', Math.max(-depth / 2, -half), Math.min(depth / 2, half)],
        ['above', Math.max(-depth / 2, half), depth / 2],
      ].filter(([, from, to]) => to > from);
  const group = svgNode('g');
  group.dataset.elementId = child.id;
  for (const [where, from, to] of slices) {
    /* Ruban ouvert (`width`) : pas d'intérieur, ses parois de devant cachent. */
    if (where === 'middle' && !hostShape.opening && !hostShape.width) continue;
    const part = createShape({
      ...child,
      height: (to - from) / scale,
      matrix: shifted(child.matrix, extrusion(child.plane, (from + to) / 2)),
    });
    delete part.dataset.elementId;
    const mask = where === 'above'
      ? null
      : where === 'below' || hostShape.width
        ? createOcclusion(hostShape, null)
        : createOpening(hostShape.opening);
    /* Enveloppe à part : un contour double porte déjà son propre masque. */
    const slice = svgNode('g', mask ? { mask: `url(#${mask.id})` } : {});
    slice.dataset.slice = where;
    if (mask) defs.append(mask);
    slice.append(part);
    group.append(slice);
  }
  return group;
};
