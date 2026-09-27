import { hiddenLines } from './hidden.js';
import { extrusion, occluder, planeBand, shifted } from './plane.js';
import { createNode, maskId, MASK_REGION, round, svgNode } from './renderer-svg.js';
import { SHAPES } from './scene.js';

/*
 * Rendu des formes sur un plan 3D : contour double en perspective, calque en
 * profondeur réelle (`hidden.js`) et occlusion entre calques. Le renderer principal y délègue ; les
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
      dashOffset: (child.dashOffset ?? 0) * scale,
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

const extrusionOf = (child) => {
  const v = child.plane && child.height ? extrusion(child.plane, child.height * (child.scale ?? 1)) : null;
  return v && Math.hypot(v.x, v.y) > 1e-6 ? v : null;
};

/* Centrée sur le plan : une profondeur de 10 va de -5 à 5. */
const centred = (child, v) => ({ ...child, matrix: shifted(child.matrix, { x: -v.x / 2, y: -v.y / 2 }) });

/* Tracé d'écran en données `d` ; un tour complet se referme. */
const screenPath = (points, closed) =>
  `M${points.map((p) => `${round(p.x)},${round(p.y)}`).join(' L')}${closed ? ' Z' : ''}`;
const runPath = (runs) =>
  runs
    .map((run) => {
      const [first, last] = [run[0], run.at(-1)];
      const loop = run.length > 2 && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9;
      return screenPath(loop ? run.slice(0, -1) : run.length === 1 ? [first, first] : run, loop);
    })
    .join(' ');

/**
 * Calque 3D : ses copies, avec leur vraie profondeur (`hiddenLines`) — l'ordre
 * des formes ne compte plus. Bloc `<g data-plane>` : aplats triés du plus loin
 * au plus proche, puis un groupe `data-element-id` par copie avec ses traits
 * visibles (contours au style de la forme, arêtes de flanc à bout rond).
 * `occluder` = silhouettes des volumes opaques, qui cachent les calques du
 * dessous (`occlude`) ; le calque ne se masque jamais lui-même.
 *
 * ponytail: tirets repris à zéro à chaque morceau visible ; aplat translucide
 * foncé là où deux faces du même volume se recouvrent.
 */
export const drawPlane = (children) => {
  const { fills, shapes } = hiddenLines(children);
  const block = svgNode('g');
  block.dataset.plane = '';
  if (fills.length > 0) {
    const paint = svgNode('g', { stroke: 'none' });
    paint.dataset.fills = '';
    paint.append(
      ...fills.map(({ child, rings, fill }) => {
        const node = svgNode('path', { d: rings.map((ring) => screenPath(ring, true)).join(' '), fill, 'fill-rule': 'evenodd', opacity: round(child.opacity ?? 1) });
        node.dataset.elementId = child.id;
        return node;
      }),
    );
    block.append(paint);
  }
  for (const { child, outlines, flanks, axis } of shapes) {
    const group = svgNode('g');
    group.dataset.elementId = child.id;
    const dot = SHAPES[child.type].geometry === 'dot';
    const width = child.strokeWidth * (dot ? (child.scale ?? 1) : 1);
    const stroked = (runs, extra) => {
      if (runs.length === 0 || child.stroke === 'none' || !(width > 0)) return [];
      return [svgNode('path', { d: runPath(runs), fill: 'none', stroke: child.stroke, 'stroke-width': round(width), 'stroke-opacity': round(child.opacity ?? 1), ...extra })];
    };
    const style = {};
    if (child.linecap && child.linecap !== 'butt') style['stroke-linecap'] = child.linecap;
    /* Tirets comme `createNode` : multiples de l'épaisseur, suivis de l'échelle. */
    if (child.dash?.length) {
      style['stroke-dasharray'] = child.dash.map((value) => round(value * width * (child.scale ?? 1))).join(' ');
      if (child.dashOffset) style['stroke-dashoffset'] = round(child.dashOffset * width * (child.scale ?? 1));
    }
    /* Bande : coins des bouts souvent aigus à l'écran, ronds comme ses arêtes. */
    if (planeBand(child)) style['stroke-linejoin'] = 'round';
    group.append(
      ...stroked(outlines, style),
      ...stroked(flanks, { 'stroke-linecap': 'round' }),
      ...stroked(axis, { 'stroke-linecap': 'round' }),
    );
    block.append(group);
  }
  const parts = children
    .filter((child) => child.opaque !== false)
    .map((child) => {
      const v = extrusionOf(child);
      return v && occluder(centred(child, v), v);
    })
    .filter(Boolean)
    .map((shape) => ({ shape, masks: [] }));
  return { node: block, occluder: parts.length > 0 ? { parts } : null };
};

/**
 * Masque « derrière ce calque » : blanc partout, noir sur la silhouette de
 * chacun de ses volumes (`parts`), blanc de nouveau dans ce qu'on voit à travers
 * le trou d'un anneau. `next` = masque des calques dessinés après lui, qu'il
 * compose (produit) : un nœud ne porte que le masque du premier qui le suit.
 */
const createOcclusion = ({ parts }, next) => {
  const mask = svgNode('mask', { id: maskId('occlude'), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  const content = svgNode('g', next ? { mask: `url(#${next})` } : {});
  content.append(svgNode('rect', { ...MASK_REGION, fill: '#fff' }));
  for (const { shape } of parts) content.append(...shadowOf(shape));
  mask.append(content);
  return mask;
};

/* Ombre d'une silhouette dans un masque d'occlusion : noire, rouverte en blanc
   sur ce qu'on voit à travers son trou. */
const shadowOf = ({ solids, opening }) => {
  const shadow = svgNode('g', { fill: '#000', stroke: 'none' });
  /* Un nœud par morceau : réunis, leurs sens de parcours s'annuleraient. */
  shadow.append(...solids.map((points) => svgNode('path', { d: screenPath(points, true) })));
  if (!opening) return [shadow];
  const clip = svgNode('clipPath', { id: maskId('opening') });
  clip.append(svgNode('path', { d: screenPath(opening[1], true) }));
  return [shadow, clip, svgNode('path', { d: screenPath(opening[0], true), fill: '#fff', 'clip-path': `url(#${clip.id})` })];
};

/**
 * Occlusion entre calques, dans l'ordre de l'arbre : chaque nœud est masqué par
 * les calques 3D dessinés après lui. `nodes` = nœuds de dessin dans l'ordre,
 * `occluders` = silhouettes du bloc de chaque calque 3D (`drawPlane`). Les
 * masques vont dans `defs`. Dans un calque, c'est la profondeur réelle.
 *
 * ponytail: un volume ouvert (ruban) ne cache pas les calques du dessous. Un
 * masque par calque, chaînés.
 */
export const occlude = (nodes, occluders, defs) => {
  let next = null;
  /* Silhouette pas encore en masque : il ne se fait que si un nœud la précède. */
  let pending = null;
  for (const node of [...nodes].reverse()) {
    if (pending) {
      const mask = createOcclusion(pending, next);
      defs.append(mask);
      [next, pending] = [mask.id, null];
    }
    if (next) {
      const holder = svgNode('g', { mask: `url(#${next})` });
      node.replaceWith(holder);
      holder.append(node);
    }
    pending = occluders.get(node) ?? null;
  }
};
