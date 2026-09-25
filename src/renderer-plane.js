import {
  extrusion,
  facingAway,
  flushCorner,
  nearRuns,
  occluder,
  offsetPolygon,
  outlinePath,
  planeDouble,
  project,
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
   peint à l'intérieur du bord intérieur, le séparateur reste vide. */
export const createPlaneDouble = (child, [outer, inner]) => {
  const scale = child.scale ?? 1;
  const edge = (points, fill) =>
    createNode({
      ...child,
      type: 'polyline',
      points: points.map((p) => ({ x: p.x - child.x, y: p.y - child.y })),
      closed: true,
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
  const nodes = [edge(outer, 'none'), edge(inner, child.fill)];
  for (const node of nodes) delete node.dataset.elementId;
  group.append(...nodes);
  return group;
};

/**
 * Forme dessinée : extrudée si son calque a un plan 3D et qu'elle a une
 * hauteur, sinon le nœud simple.
 */
export const createShape = (child) => {
  const v = child.plane && child.height ? extrusion(child.plane, child.height * (child.scale ?? 1)) : null;
  if (!v || Math.hypot(v.x, v.y) <= 1e-6) return createNode(child);
  /* Centrée sur le plan : une profondeur de 10 va de -5 à 5. */
  return createExtrusion({ ...child, matrix: shifted(child.matrix, { x: -v.x / 2, y: -v.y / 2 }) }, v);
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
 * traits (évidés par `hollowStroke`), l'un à l'aller, l'autre au retour, en
 * un contour fermé. Ses coins sont ceux du tracé sur chaque trait. `null`
 * hors de ce cas.
 * Ses bouts se ferment, en haut comme au fond : c'est un volume.
 */
const openBand = (child, { closed, corners }, flat, width) => {
  const gap = (child.gap ?? 0) * (child.scale ?? 1);
  const dot = SHAPES[child.type].geometry === 'dot';
  if (closed || dot || !child.outlined || child.stroke === 'none' || width <= 0 || gap <= 0 || flat.length < 2) {
    return null;
  }
  const reach = (width + gap) / 2;
  const [left, right] = [offsetPolygon(flat, reach, false), offsetPolygon(flat, -reach, false)];
  const n = flat.length;
  return {
    base: [...left, ...right.reverse()],
    closed: true,
    corners: [...new Set([0, n - 1, ...corners])].flatMap((i) => [i, 2 * n - 1 - i]),
  };
};

/**
 * Parois d'un volume qui peut se cacher lui-même (ruban, tracé ouvert, étoile,
 * tracé fermé creux). Peintes dans un masque de la plus loin à la plus proche :
 * chaque paroi efface (noir) ce qu'elle couvre puis trace ses arêtes (blanc) ;
 * la face avant efface en dernier, son contour se dessine par-dessus. Le
 * masque découpe un aplat de la couleur du trait. `base` = contour du bas à
 * l'écran, `edges` = sommets dont l'arête de flanc se voit.
 *
 * ponytail: ordre du peintre par milieu de paroi — juste pour des parois
 * courtes (tracé échantillonné) ; une longue paroi en biais peut mal se
 * trier. Arêtes du fond en segments à bouts ronds, sans tirets.
 */
const createWalls = (child, { base, closed, edges, v, up, width }) => {
  const n = base.length;
  const [backShift, frontShift] = up ? [{ x: 0, y: 0 }, v] : [v, { x: 0, y: 0 }];
  const top = moved(base, v);
  /* Le plan descend vers le bas de l'écran : plus un point monte le long de
     l'extrusion (hauteur positive), plus il est loin. */
  const rise = up ? v : { x: -v.x, y: -v.y };
  const far = (i, j) => ((base[i].x + base[j].x) * rise.x + (base[i].y + base[j].y) * rise.y) / 2;
  const line = (d) => svgNode('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': round(width), 'stroke-linecap': 'round' });
  const shown = new Set(edges);
  const walls = Array.from({ length: closed ? n : n - 1 }, (_, i) => [i, (i + 1) % n])
    .sort(([a, b], [c, d]) => far(c, d) - far(a, b))
    .flatMap(([i, j]) => [
      /* Liseré noir : deux parois voisines se chevauchent, sans couture d'anticrénelage. */
      svgNode('path', { d: screenPath([base[i], base[j], top[j], top[i]], true), fill: '#000', stroke: '#000', 'stroke-width': 1 }),
      line(
        [
          screenPath(moved([base[i], base[j]], backShift), false),
          ...[i, j].filter((k) => shown.has(k)).map((k) => screenPath([base[k], top[k]], false)),
        ].join(' '),
      ),
    ]);
  const mask = svgNode('mask', { id: maskId(`walls-${child.id}`), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  mask.dataset.walls = '';
  mask.append(
    svgNode('rect', { ...MASK_REGION, fill: '#000' }),
    line(screenPath(moved(base, backShift), closed)),
    ...walls,
    ...(closed ? [svgNode('path', { d: screenPath(moved(base, frontShift), true), fill: '#000', stroke: 'none' })] : []),
  );
  const paint = svgNode('rect', { ...MASK_REGION, fill: child.stroke, opacity: round(child.opacity ?? 1), mask: `url(#${mask.id})` });
  return [mask, paint];
};

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

const createExtrusion = (child, v) => {
  const up = child.height > 0;
  const lifted = { ...child, matrix: shifted(child.matrix, v) };
  const [front, back] = up ? [lifted, child] : [child, lifted];
  const [frontShift, backShift] = up ? [v, { x: 0, y: 0 }] : [{ x: 0, y: 0 }, v];
  const outline = outlinePath(child);
  const geometry = SHAPES[child.type].geometry;
  const dot = geometry === 'dot';
  const width = child.strokeWidth * (dot ? (child.scale ?? 1) : 1);
  /* Contour double ouvert : un volume plein, la bande entre ses deux traits.
     Il se traite comme un contour fermé — face du haut et parois cachent le
     fond et les arêtes de derrière. */
  const flat = outline.points.map((p) => project(child.matrix, p));
  const band = openBand(child, outline, flat, width);
  const { base, closed, corners } = band ?? { ...outline, base: flat };
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
  } else if (band || (!closed && !dot) || (closed && !convex(base))) {
    /* Ruban, tracé ouvert, étoile, tracé fermé creux : ses parois proches
       cachent les lointaines, ce que la moitié proche du fond ignore. */
    const edges = [...new Set([...silhouette(base, closed, v), ...corners])];
    const [mask, paint] = createWalls(child, { base, closed, edges, v, up, width });
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
  group.append(volume, face);
  return group;
};


/** Silhouette opaque d'une forme extrudée (`occluder`), ou `null`. */
export const shapeOccluder = (child) => {
  const v = child.plane && child.height ? extrusion(child.plane, child.height * (child.scale ?? 1)) : null;
  if (!v || Math.hypot(v.x, v.y) <= 1e-6) return null;
  return occluder({ ...child, matrix: shifted(child.matrix, { x: -v.x / 2, y: -v.y / 2 }) }, v);
};

/**
 * Masque « derrière ce volume » : blanc partout, noir sur sa silhouette, blanc
 * de nouveau dans ce qu'on voit à travers son trou. `next` = masque des
 * volumes dessinés après lui, qu'il compose (produit) : une forme ne porte que
 * le masque du premier volume qui la suit.
 */
const createOcclusion = ({ solids, opening }, next) => {
  const mask = svgNode('mask', { id: maskId('occlude'), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  const content = svgNode('g', next ? { mask: `url(#${next})` } : {});
  const shadow = svgNode('g', { fill: '#000', stroke: 'none' });
  /* Un nœud par morceau : réunis, leurs sens de parcours s'annuleraient. */
  shadow.append(...solids.map((points) => svgNode('path', { d: screenPath(points, true) })));
  content.append(svgNode('rect', { ...MASK_REGION, fill: '#fff' }), shadow);
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
    if (where === 'middle' && !hostShape.opening) continue;
    const part = createShape({
      ...child,
      height: (to - from) / scale,
      matrix: shifted(child.matrix, extrusion(child.plane, (from + to) / 2)),
    });
    delete part.dataset.elementId;
    const mask = where === 'above' ? null : where === 'below' ? createOcclusion(hostShape, null) : createOpening(hostShape.opening);
    /* Enveloppe à part : un contour double porte déjà son propre masque. */
    const slice = svgNode('g', mask ? { mask: `url(#${mask.id})` } : {});
    slice.dataset.slice = where;
    if (mask) defs.append(mask);
    slice.append(part);
    group.append(slice);
  }
  return group;
};
