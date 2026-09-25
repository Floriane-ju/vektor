import {
  absolutePoints,
  activePlane,
  clampExtent,
  getActiveElement,
  getActiveLayer,
  getRenderedChildren,
  pivotOf,
  selectedIds,
  SHAPES,
  STAGE,
} from './scene.js';
import { axisDirection } from './modifiers.js';
import { extrusion, outlinePath, planeBand, planeDouble, planeMatrix, polygonVertices, project, shifted } from './plane.js';
import { createInside, createPlaneDouble, createShape, occlude, shapeOccluder, wallNeighbours } from './renderer-plane.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/* Une copie rendue : rang de la copie du calque, puis de la copie propre de la forme. */
const copyKey = (id, { copy, own = 0 }) => `${id}:${copy}:${own}`;

/**
 * Dessin d'un calque, retenu tant que sa référence ne change pas (les
 * transitions sont immuables) : `group` et ses nœuds de dessin `drawn` dans
 * l'ordre, silhouettes des volumes 3D (`occluders`), boîte de la copie source
 * de chaque forme (`bounds`), boîte du dessin (`box`, outils exclus) et de
 * toutes les copies (`frame`, cadre du calque sélectionné).
 */
const drawLayer = (layer) => {
  const children = layerChildren(layer);
  const entry = { layer, group: null, drawn: [], occluders: new Map(), bounds: new Map(), box: null, frame: null };
  if (children.length === 0) return entry;

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.layerId = layer.id;
  /* Masques des formes logées : propres au calque, pour qu'il se garde entier. */
  const defs = svgNode('defs');
  /* Forme logée dans un volume (`inside`) : tranchée selon la profondeur de
     son hôte de même copie (`createInside`), et dessinée juste après lui.
     ponytail: une forme logée ne cache pas les autres volumes. */
  const nodeOf = new Map();
  const shape = (child, host, hostCopies, walls) => {
    const hostShape = host && shapeOccluder(host, child, hostCopies);
    const node = hostShape ? createInside(child, host, hostShape, defs) : createShape(child, walls);
    nodeOf.set(copyKey(child.id, child), { node, host: hostShape ? copyKey(host.id, host) : null });
    const silhouette = hostShape ? null : shapeOccluder(child);
    if (silhouette) entry.occluders.set(node, silhouette);
    return node;
  };

  /* Un outil booléen ne se dessine pas : il ne vit que dans le résultat. */
  const tools = new Set(layer.elements.flatMap((element) => element.booleans.map((step) => step.with)));
  const byCopy = new Map(children.map((child) => [copyKey(child.id, child), child]));
  /* Outil ou hôte de même copie ; répété moins que la forme, sa copie propre 0.
     ponytail: un outil répété sous une forme qui ne l'est pas n'agit que par
     sa première copie propre. */
  const partner = (id, child) => byCopy.get(copyKey(id, child)) ?? byCopy.get(copyKey(id, { ...child, own: 0 }));
  /* Volumes qui se cachent eux-mêmes : ils se cachent aussi l'un l'autre. */
  const walls = wallNeighbours(children.filter((child) => !tools.has(child.id) && child.booleans.length === 0 && !child.inside));
  /* Recoupements creux : les aplats rejoignent un tracé commun, chaque forme
     ne garde que son trait. */
  const holes = [];
  let holeFill;
  for (const child of children) {
    const box = childBounds(child);
    if (!entry.bounds.has(child.id)) entry.bounds.set(child.id, box);
    entry.frame = entry.frame ? union(entry.frame, box) : box;
    if (tools.has(child.id)) continue;
    entry.box = entry.box ? union(entry.box, box) : box;
    const steps = child.booleans
      .map((step) => ({ shape: partner(step.with, child), op: step.op }))
      .filter((step) => step.shape);
    if (steps.length > 0) {
      group.append(createBoolean(child, steps));
      continue;
    }
    const host = child.inside ? partner(child.inside, child) : null;
    const hostCopies = host && children.filter((other) => other.id === host.id && other.copy === host.copy);
    const others = walls.get(child);
    const area = layer.evenOdd && child.fill !== 'none' ? areaPath(child) : null;
    if (!area) {
      group.append(shape(child, host, hostCopies, others));
      continue;
    }
    holes.push({ area, opacity: child.opacity ?? 1 });
    holeFill ??= child.fill;
    const outline = shape({ ...child, fill: 'none' }, host, hostCopies, others);
    /* L'intérieur reste cliquable au curseur, même creusé. */
    outline.setAttribute('pointer-events', 'visible');
    group.append(outline);
  }
  if (holes.length > 0) {
    const { node, mask } = createEvenOdd(layer, holes, holeFill);
    group.prepend(node);
    if (mask) group.append(mask);
  }
  /* Chaque forme logée passe juste après son hôte : ni l'hôte ne la cache en
     entier, ni elle ne passe devant les volumes qui le suivent. */
  for (const { node, host } of [...nodeOf.values()].reverse()) {
    const hostNode = host && nodeOf.get(host)?.node;
    if (hostNode?.parentNode === group) hostNode.after(node);
  }
  entry.drawn = [...group.children];
  if (defs.children.length > 0) group.append(defs);
  entry.group = group;
  return entry;
};

/* Un calque repris du rendu précédent quitte les enveloppes d'occlusion que
   les volumes des autres calques lui avaient posées : elles se refont. */
const unwrap = (entry) => {
  for (const node of entry.drawn) {
    if (node.parentNode !== entry.group) node.parentNode?.replaceWith(node);
  }
  return entry;
};

/* Dernier rendu de chaque `<svg>` : `layers` = le tableau de la scène dessinée,
   `entries` = le dessin de chaque calque visible, `overlay` = la couche d'écran. */
const renders = new WeakMap();

/**
 * Dessin de la scène : chaque calque repris s'il n'a pas changé, puis
 * l'occlusion entre volumes, qui traverse les calques (`occlude`), refaite
 * sur l'ensemble depuis les silhouettes retenues.
 */
const drawScene = (scene, svgRoot, state) => {
  const entries = new Map();
  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    const cached = state.entries.get(layer.id);
    entries.set(layer.id, cached?.layer === layer ? unwrap(cached) : drawLayer(layer));
  }
  const visible = [...entries.values()].filter((entry) => entry.group);
  const drawn = visible.flatMap((entry) => entry.drawn);
  const occluders = new Map(visible.flatMap((entry) => [...entry.occluders]));
  const defs = svgNode('defs');
  if (occluders.size > 0) occlude(drawn, occluders, defs);
  svgRoot.replaceChildren(...(defs.children.length > 0 ? [defs] : []), ...visible.map((entry) => entry.group));

  sourceBounds.set(svgRoot, new Map(visible.flatMap((entry) => [...entry.bounds])));
  const boxes = visible.map((entry) => entry.box).filter(Boolean);
  drawings.set(svgRoot, boxes.length > 0 ? boxes.reduce(union) : null);
  return { layers: scene.layers, entries, overlay: [] };
};

/**
 * Rend la scène dans le `<svg>` du DOM.
 *
 * Ce nœud est à la fois le preview et la source de l'export : il n'y a qu'un
 * seul moteur de rendu, donc rien à garder en phase entre l'écran et le
 * fichier.
 *
 * Incrémental : un calque inchangé garde ses nœuds ; sans calque changé
 * (sélection seule), seule la couche d'écran — sélection, repères, poignées —
 * est refaite. Le survol, état d'écran lui aussi, est effacé à chaque rendu.
 */
export const render = (scene, svgRoot) => {
  let state = renders.get(svgRoot);
  if (state?.layers === scene.layers) {
    for (const node of [...state.overlay, ...svgRoot.querySelectorAll('[data-hover]')]) node.remove();
  } else {
    state = drawScene(scene, svgRoot, state ?? { entries: new Map() });
  }
  const layer = getActiveLayer(scene);
  const element = getActiveElement(scene);
  state.overlay = [
    createSelection(scene, svgRoot, state.entries),
    createGuides(layer, layer?.elements.includes(element) ? element : null),
    createHandles(scene),
  ].filter(Boolean);
  svgRoot.append(...state.overlay);
  renders.set(svgRoot, state);
};

/**
 * Copies rendues d'un calque, chacune munie de la matrice de son plan 3D
 * (`matrix`) et du plan lui-même : `createNode` projette alors la géométrie.
 */
const layerChildren = (layer) => {
  const children = getRenderedChildren(layer);
  const plane = activePlane(layer);
  if (!plane) return children;
  const matrix = planeMatrix(plane);
  return children.map((child) => ({ ...child, matrix, plane }));
};

/* SVG `matrix()` d'un plan, pour les repères posés à plat dessus. */
const planeTransform = (layer) => {
  const plane = activePlane(layer);
  if (!plane) return '';
  const { a, b, c, d, e, f } = planeMatrix(plane);
  return `matrix(${[a, b, c, d, e, f].map(round).join(' ')})`;
};

/* Rayon d'une poignée de sommet, en unités du dessin. */
const HANDLE_RADIUS = 5;

/**
 * Poignées des sommets du tracé sélectionné, posées sur la forme source — la
 * copie que la pile de modificateurs laisse en place. Glisser une poignée
 * déplace le sommet (voir la toolbar) ; l'export les retire, comme les repères.
 */
const createHandles = (scene) => {
  const element = getActiveElement(scene);
  const layer = scene.layers.find((candidate) => candidate.elements.includes(element));
  if (!element || SHAPES[element.type].geometry !== 'polyline' || !layer?.visible) return null;

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.handles = element.id;
  group.setAttribute('fill', '#1b1b1b');
  group.setAttribute('stroke', '#ee4722');
  group.setAttribute('stroke-width', '2');
  group.setAttribute('vector-effect', 'non-scaling-stroke');
  const transform = [planeTransform(layer), element.rotation ? rotateAbout(element.rotation, element) : '']
    .filter(Boolean)
    .join(' ');
  if (transform) group.setAttribute('transform', transform);
  absolutePoints(element).forEach((point, index) => {
    const handle = guideNode('circle', { cx: point.x, cy: point.y, r: HANDLE_RADIUS });
    handle.dataset.vertex = String(index);
    group.append(handle);
  });
  return group;
};

/* Demi-longueur des branches de la croix qui marque un centre. */
const GUIDE_MARK = 14;

const guideNode = (geometry, attrs) => {
  const node = document.createElementNS(SVG_NS, geometry);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, round(value));
  return node;
};

const guideLine = (x1, y1, x2, y2) => guideNode('line', { x1, y1, x2, y2 });

/**
 * Marque un centre de transformation : une croix, deux branches égales de part
 * et d'autre du point.
 *
 * Trait plein : les tirets du groupe partent du début de chaque branche, donc
 * une croix pointillée rend des bras inégaux et le centre paraît décalé.
 */
const guideCenter = (center) => {
  const cross = [
    guideLine(center.x - GUIDE_MARK, center.y, center.x + GUIDE_MARK, center.y),
    guideLine(center.x, center.y - GUIDE_MARK, center.x, center.y + GUIDE_MARK),
  ];
  for (const branch of cross) branch.setAttribute('stroke-dasharray', 'none');
  /* Zone de saisie invisible : une croix de 1 px ne se viserait pas. */
  const grip = guideNode('circle', { cx: center.x, cy: center.y, r: GUIDE_MARK });
  grip.dataset.grip = '';
  grip.setAttribute('fill', 'transparent');
  grip.setAttribute('stroke', 'none');
  grip.setAttribute('pointer-events', 'all');
  return [...cross, grip];
};

/**
 * Axe de symétrie d'un miroir : la seule chose que `n` ne déplace plus.
 * Prolongé sur toute l'étendue des masques ; incliné, il est coupé par le premier
 * bord atteint de chaque côté du pivot.
 */
const mirrorGuides = (center, modifier) => {
  const d = axisDirection(modifier);
  const spans = [
    [center.x, d.x, MASK_REGION.x, MASK_REGION.width],
    [center.y, d.y, MASK_REGION.y, MASK_REGION.height],
  ]
    .filter(([, dir]) => dir !== 0)
    .map(([from, dir, low, size]) => [(low - from) / dir, (low + size - from) / dir].sort((a, b) => a - b));
  const start = Math.max(...spans.map((span) => span[0]));
  const end = Math.min(...spans.map((span) => span[1]));
  const line = guideLine(center.x + start * d.x, center.y + start * d.y, center.x + end * d.x, center.y + end * d.y);
  /* Même axe en trait épais transparent : c'est lui qu'on saisit. */
  const grip = line.cloneNode();
  grip.dataset.grip = '';
  grip.setAttribute('stroke-opacity', '0');
  grip.setAttribute('stroke-width', String(GUIDE_MARK));
  grip.setAttribute('pointer-events', 'stroke');
  return [line, grip];
};

/**
 * Repères propres à chaque modificateur : l'axe pour un miroir, le centre de
 * rotation pour l'axial et la spirale, posés sur le pivot de l'étage.
 *
 * Mêmes types que `PIVOTING` : `none` et `step` n'ont pas de lieu à montrer.
 */
const GUIDES = {
  mirrorH: mirrorGuides,
  mirrorV: mirrorGuides,
  axial: guideCenter,
  spiral: guideCenter,
  archimedes: guideCenter,
};

/**
 * Repères de la pile de modificateurs du calque actif : chaque modificateur qui
 * a un lieu à montrer y pose le sien, dans l'ordre de la pile, dans un groupe
 * `data-pivot` = son rang — la toolbar le saisit pour déplacer le pivot.
 *
 * Ils vivent dans le `<svg>` de la scène : même viewBox, donc ils restent
 * alignés sous le zoom sans qu'aucune coordonnée soit recalculée. `toSvgDocument`
 * les retire — ce sont des repères d'écran, pas du dessin.
 */
const createGuides = (layer, element = null) => {
  const stages = (owner) => owner.modifiers.map((modifier, index) => ({ modifier, index, owner }));
  /* La forme sélectionnée montre aussi les étages de sa propre pile. */
  const marked = layer?.visible
    ? [...stages(layer), ...(element ? stages(element) : [])].filter(({ modifier }) =>
        Object.hasOwn(GUIDES, modifier.type),
      )
    : [];
  if (marked.length === 0) return null;

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.guides = marked.map(({ modifier }) => modifier.type).join(' ');
  group.setAttribute('fill', 'none');
  /* Gris neutre : un repère ne doit pas se confondre avec un trait dessiné,
     dont l'accent est la couleur par défaut. */
  group.setAttribute('stroke', '#a2a8b4');
  group.setAttribute('stroke-width', '1');
  group.setAttribute('stroke-opacity', '0.45');
  group.setAttribute('stroke-dasharray', '6 6');
  /* Le trait garde son épaisseur à l'écran quel que soit le zoom : un repère
     qui grossit avec le dessin finit par le cacher. */
  group.setAttribute('vector-effect', 'non-scaling-stroke');
  /* Seules les zones de saisie des pivots captent le pointeur. */
  group.setAttribute('pointer-events', 'none');
  if (activePlane(layer)) group.setAttribute('transform', planeTransform(layer));
  group.append(
    ...marked.map(({ modifier, index, owner }) => {
      const pivot = document.createElementNS(SVG_NS, 'g');
      pivot.dataset.pivot = String(index);
      if (owner !== layer) pivot.dataset.pivotOwner = owner.id;
      pivot.append(...GUIDES[modifier.type](pivotOf(layer, index, owner), modifier));
      return pivot;
    }),
  );
  return group;
};

export const polygonPoints = (cx, cy, radius, sides, inner) =>
  polygonVertices(cx, cy, radius, sides, inner)
    .map((p) => `${round(p.x)},${round(p.y)}`)
    .join(' ');

/**
 * Tracé `d` d'un arc de `start` à `end` (degrés, 0 en haut, sens horaire).
 *
 * Un tour complet ne s'écrit pas en une commande `A` — ses deux bouts
 * confondus ne disent plus quel cercle passer — donc il se fait en deux
 * demi-arcs et se ferme, quel que soit le mode : ni rayon au centre ni corde
 * n'y auraient de sens.
 */
export const arcPath = (cx, cy, radius, start, end, closure, place = (p) => p, mirrored = false) => {
  const xy = (p) => {
    const placed = place(p);
    return `${round(placed.x)},${round(placed.y)}`;
  };
  const at = (degrees) => {
    const angle = (degrees * Math.PI) / 180;
    return xy({ x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) });
  };
  const r = `${round(radius)},${round(radius)}`;
  /* Un reflet inverse le sens de parcours. */
  const clockwise = mirrored ? 0 : 1;
  const span = end - start;
  if (Math.abs(span) >= 360) {
    return `M${at(start)} A${r} 0 0 ${clockwise} ${at(start + 180)} A${r} 0 0 ${clockwise} ${at(start)} Z`;
  }
  /* Un arc à rebours (270 → 90) court quand même en sens horaire. */
  const sweep = ((span % 360) + 360) % 360;
  const arc = `M${at(start)} A${r} 0 ${sweep > 180 ? 1 : 0} ${clockwise} ${at(start + sweep)}`;
  if (closure === 'sector') return `${arc} L${xy({ x: cx, y: cy })} Z`;
  return closure === 'chord' ? `${arc} Z` : arc;
};

/**
 * Contour d'une copie en données de `<path>`, dans le repère du plan : reflet
 * puis rotation cuits dans les coordonnées, comme `createNode` les pose en
 * `transform`. C'est ce qui permet à toutes les copies de partager un tracé.
 * Une ligne et un point n'ont pas d'aire : `null`.
 */
export const areaPath = (child) => {
  if (child.matrix) {
    const { points, closed } = outlinePath(child);
    /* L'aplat suit la face avant : celle du haut, à une demi-profondeur du plan. */
    const v = child.height ? extrusion(child.plane, child.height * (child.scale ?? 1)) : null;
    const matrix = v ? shifted(child.matrix, { x: v.x / 2, y: v.y / 2 }) : child.matrix;
    return closed && points.length > 2 ? projectedPath(matrix, points, true) : null;
  }
  const scale = child.scale ?? 1;
  const rx = clampExtent(child.type, child.rx * scale);
  const ry = clampExtent(child.type, child.ry * scale);
  const { x, y } = child;
  const rotation = degrees(child.rotation ?? 0);
  const [cos, sin] = [Math.cos(rotation), Math.sin(rotation)];
  const place = (p) => {
    const dx = child.flip ? x - p.x : p.x - x;
    const dy = p.y - y;
    return { x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos };
  };
  const polygon = (points) =>
    `M${points.map((p) => {
      const placed = place(p);
      return `${round(placed.x)},${round(placed.y)}`;
    }).join(' L')} Z`;
  switch (SHAPES[child.type].geometry) {
    case 'rect':
      return polygon([
        { x: x - rx, y: y - ry },
        { x: x + rx, y: y - ry },
        { x: x + rx, y: y + ry },
        { x: x - rx, y: y + ry },
      ]);
    case 'polygon':
      return polygon(polygonVertices(x, y, rx, child.sides, child.inner));
    case 'polyline':
      return polygon(child.points.map((p) => ({ x: x + p.x * scale, y: y + p.y * scale })));
    case 'arc':
      return arcPath(x, y, rx, child.start, child.end, child.closure, place, child.flip);
    case 'ellipse': {
      /* Deux demi-ellipses ; le reflet laisse une ellipse identique à elle-même. */
      const [top, bottom] = [place({ x, y: y - ry }), place({ x, y: y + ry })];
      const half = `A${round(rx)},${round(ry)} ${round(child.rotation ?? 0)} 0 1`;
      return `M${round(top.x)},${round(top.y)} ${half} ${round(bottom.x)},${round(bottom.y)} ${half} ${round(top.x)},${round(top.y)} Z`;
    }
    default:
      return null;
  }
};

/**
 * Aplat commun des formes remplies d'un calque en recoupements creux : un seul
 * `<path>` pair-impair, donc une zone couverte deux fois se vide.
 *
 * L'estompe passe par un masque où chaque copie peint son aire de sa propre
 * opacité : découper l'aplat par copie défairait le pair-impair.
 * ponytail: l'aplat est de la couleur de la première copie remplie, et là où
 * trois aires ou plus se recouvrent le masque compose leurs opacités — exact
 * partout où une seule copie couvre.
 */
const createEvenOdd = (layer, holes, fill) => {
  const node = svgNode('path', { d: holes.map(({ area }) => area).join(' '), 'fill-rule': 'evenodd', fill, stroke: 'none' });
  node.dataset.evenOdd = layer.id;
  if (holes.every(({ opacity }) => opacity >= 1)) return { node, mask: null };
  const mask = svgNode('mask', { id: maskId(`even-odd-${layer.id}`), maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  for (const { area, opacity } of holes) {
    mask.append(svgNode('path', { d: area, fill: '#fff', opacity: round(opacity) }));
  }
  node.setAttribute('mask', `url(#${mask.id})`);
  return { node, mask };
};

export const createNode = (child) => {
  const double = child.matrix ? planeDouble(child) : null;
  if (double) return createPlaneDouble(child, double);
  const band = child.matrix ? planeBand(child) : null;
  if (band) return createPlaneDouble(child, band, false);
  const scale = child.scale ?? 1;
  const rx = clampExtent(child.type, child.rx * scale);
  const ry = clampExtent(child.type, child.ry * scale);
  const geometry = SHAPES[child.type].geometry;

  /* Sur un plan 3D, toute forme devient un `<path>` projeté : la matrice passe
     dans les coordonnées, pas en `transform`, qui écraserait aussi le trait. */
  const tag = child.matrix
    ? 'path'
    : ({ dot: 'line', arc: 'path', polyline: child.closed ? 'polygon' : 'polyline' }[geometry] ?? geometry);
  const node = document.createElementNS(SVG_NS, tag);
  node.dataset.elementId = child.id;
  let strokeWidth = child.strokeWidth;
  if (child.matrix) {
    const { points, closed } = outlinePath(child);
    node.setAttribute('d', projectedPath(child.matrix, points, closed));
    if (geometry === 'dot') {
      node.setAttribute('stroke-linecap', 'round');
      strokeWidth *= scale;
    }
  } else if (geometry === 'dot') {
    /* Trait de longueur nulle : seul le bout rond est peint, d'un diamètre égal
       à l'épaisseur. L'échelle agit donc sur l'épaisseur, faute d'étendue. */
    for (const axis of ['x1', 'x2']) node.setAttribute(axis, round(child.x));
    for (const axis of ['y1', 'y2']) node.setAttribute(axis, round(child.y));
    node.setAttribute('stroke-linecap', 'round');
    strokeWidth *= scale;
  } else if (geometry === 'line') {
    /* Mêmes demi-extensions que les autres formes, mais signées : la ligne va
       d'un bout à l'autre en passant par son centre, donc l'échelle l'étire
       depuis son milieu et le modificateur la déplace d'un seul point. */
    node.setAttribute('x1', round(child.x - rx));
    node.setAttribute('y1', round(child.y - ry));
    node.setAttribute('x2', round(child.x + rx));
    node.setAttribute('y2', round(child.y + ry));
  } else if (geometry === 'rect') {
    /* `rx`/`ry` sont des demi-extensions depuis le centre ; `<rect>` se place
       par son coin, d'où la translation. */
    node.setAttribute('x', round(child.x - rx));
    node.setAttribute('y', round(child.y - ry));
    node.setAttribute('width', round(rx * 2));
    node.setAttribute('height', round(ry * 2));
  } else if (geometry === 'ellipse') {
    node.setAttribute('cx', round(child.x));
    node.setAttribute('cy', round(child.y));
    node.setAttribute('rx', round(rx));
    node.setAttribute('ry', round(ry));
  } else if (geometry === 'polyline') {
    /* Sommets relatifs au centre : l'échelle les rapproche de lui. */
    node.setAttribute(
      'points',
      child.points.map((p) => `${round(child.x + p.x * scale)},${round(child.y + p.y * scale)}`).join(' '),
    );
  } else if (geometry === 'arc') {
    node.setAttribute('d', arcPath(child.x, child.y, rx, child.start, child.end, child.closure));
  } else if (geometry === 'polygon') {
    node.setAttribute('points', polygonPoints(child.x, child.y, rx, child.sides, child.inner));
  }

  /* Orientation de la copie et rotation propre, autour du centre de la forme
     après le déplacement des modificateurs : la géométrie émise reste celle de
     la forme droite. Le reflet passe avant l'angle. */
  const transform = child.matrix
    ? []
    : [child.rotation ? rotateAbout(child.rotation, child) : '', child.flip ? flipAbout(child) : ''].filter(Boolean);
  if (transform.length > 0) node.setAttribute('transform', transform.join(' '));
  node.setAttribute('fill', child.fill);
  node.setAttribute('stroke', child.stroke);
  node.setAttribute('stroke-width', round(strokeWidth));
  /* Le point impose son bout rond, et n'a pas de longueur à découper. */
  if (geometry !== 'dot') {
    if (child.linecap && child.linecap !== 'butt') node.setAttribute('stroke-linecap', child.linecap);
    /* Tirets en multiples de l'épaisseur, suivis de l'échelle de la copie : un
       anneau réduit garde le même nombre de tirets, pas la même longueur. */
    if (child.dash?.length) {
      node.setAttribute('stroke-dasharray', child.dash.map((v) => round(v * strokeWidth * scale)).join(' '));
      if (child.dashOffset) node.setAttribute('stroke-dashoffset', round(child.dashOffset * strokeWidth * scale));
    }
  }
  /* Une seule opacité pour trait et aplat : séparées, la moitié intérieure du
     trait se peindrait sur l'aplat translucide et foncerait le bord. */
  node.setAttribute('opacity', round(child.opacity ?? 1));
  /* L'écart suit l'échelle de la copie, l'épaisseur non. */
  const gap = (child.gap ?? 0) * scale;
  const hollow = child.outlined && geometry !== 'dot' && child.stroke !== 'none' && strokeWidth > 0 && gap > 0;
  return hollow ? hollowStroke(node, `outline-${child.id}-${outlineSerial++}`, strokeWidth, gap) : node;
};

/* Données `d` d'un contour projeté. Un point seul se trace en segment nul :
   le bout rond le peint. */
export const projectedPath = (matrix, points, closed) => {
  const xy = points.map((p) => {
    const q = project(matrix, p);
    return `${round(q.x)},${round(q.y)}`;
  });
  return `M${(xy.length === 1 ? [xy[0], xy[0]] : xy).join(' L')}${closed ? ' Z' : ''}`;
};

/* Numéro des masques : un id par nœud, même quand une copie est dessinée
   plusieurs fois (booléens). Jamais remis à zéro : un calque repris du rendu
   précédent garde les siens, un calque refait ne doit pas les croiser.
   ponytail: le compteur grandit sans fin — 2^53 masques avant d'y penser. */
let outlineSerial = 0;
export const maskId = (prefix) => `${prefix}-${outlineSerial++}`;

/**
 * Contour double : un trait large de deux épaisseurs plus l'écart, évidé en
 * son milieu par un masque — le même nœud, tracé de la largeur de l'écart.
 * Le vide traverse aussi l'aplat. Le masque garde tirets, bouts, transform et
 * `vector-effect` du nœud, puisqu'il en est la copie. L'enveloppe reprend
 * l'identifiant.
 */
const hollowStroke = (node, id, strokeWidth, gap) => {
  node.setAttribute('stroke-width', round(strokeWidth * 2 + gap));
  const hollow = node.cloneNode(false);
  delete hollow.dataset.elementId;
  for (const [name, value] of Object.entries({ fill: 'none', stroke: '#000', 'stroke-width': round(gap), opacity: 1 })) {
    hollow.setAttribute(name, value);
  }
  const mask = svgNode('mask', { id, maskUnits: 'userSpaceOnUse', ...MASK_REGION });
  mask.append(svgNode('rect', { ...MASK_REGION, fill: '#fff' }), hollow);
  const group = svgNode('g', { mask: `url(#${mask.id})` });
  if (node.dataset.elementId) group.dataset.elementId = node.dataset.elementId;
  delete node.dataset.elementId;
  group.append(mask, node);
  return group;
};

/* Marge autour de l'aperçu, en fraction de son côté : le trait déborde du
   contour, davantage quand il est double. */
const PREVIEW_PADDING = { single: 0.08, double: 0.12 };
/* Trait de l'aperçu, en pixels à l'écran ; doublé, deux traits plus fins et
   un écart du même ordre, pour que le double se lise sans suivre le dessin. */
const PREVIEW_STROKE = 1.8;
const PREVIEW_DOUBLE = { stroke: 1.2, gap: 1.2 };
/* Les aperçus vivent tous dans le même document : ids de masque uniques. */
let previewSerial = 0;

/**
 * Aperçu d'une forme pour l'arbre : sa géométrie telle que dessinée (ratio,
 * rotation), cadrée sur sa boîte dans un carré de `size` pixels, en
 * `currentColor` et d'un trait fixe à l'écran — double si la forme l'est,
 * sans l'écart réel. `null` pour le point, qui n'a pas d'étendue à montrer.
 */
export const shapePreview = (element, size) => {
  if (SHAPES[element.type].geometry === 'dot') return null;
  const child = { ...element, flip: false, strokeWidth: 0, dash: [], opacity: 1, outlined: false };
  let node = createNode({ ...child, fill: element.filled ? 'currentColor' : 'none', stroke: 'currentColor' });
  delete node.dataset.elementId;
  node.setAttribute('stroke-width', PREVIEW_STROKE);
  node.setAttribute('vector-effect', 'non-scaling-stroke');
  if (element.outlined) {
    node = hollowStroke(node, `preview-outline-${previewSerial++}`, PREVIEW_DOUBLE.stroke, PREVIEW_DOUBLE.gap);
  }
  const box = childBounds(child);
  const padding = PREVIEW_PADDING[element.outlined ? 'double' : 'single'];
  const side = Math.max(box.maxX - box.minX, box.maxY - box.minY) * (1 + padding * 2) || 1;
  const left = (box.minX + box.maxX - side) / 2;
  const top = (box.minY + box.maxY - side) / 2;
  const svg = svgNode('svg', { width: size, height: size, viewBox: [left, top, side, side].map(round).join(' ') });
  svg.append(node);
  return svg;
};

/* Étendue d'un masque, en unités du dessin : le plan est infini, un masque non.
   ponytail: ±20 plans autour du plan de référence, plus que ce que montre le
   zoom minimal ; une forme posée plus loin serait coupée net. */
const WORLD = 20;
export const MASK_REGION = {
  x: -STAGE.width * WORLD,
  y: -STAGE.height * WORLD,
  width: STAGE.width * (2 * WORLD + 1),
  height: STAGE.height * (2 * WORLD + 1),
};

/* Ce que chaque opération garde des bords, comme un pathfinder : les bords
   déjà acquis, dedans ou dehors de l'outil ; le bord de l'outil, dedans ou
   dehors du résultat précédent. */
const EDGE_KEEP = { union: 'out', subtract: 'out', intersect: 'in' };
const TOOL_EDGE_KEEP = { union: 'out', subtract: 'in', intersect: 'in' };

export const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
};

/* Nœud masqué : l'enveloppe porte le masque, pour qu'un bord en cumule un par
   étape de la pile sans qu'un masque en écrase un autre. */
const wrap = (nodes, mask) => {
  const node = svgNode('g', { mask });
  node.append(...nodes);
  return node;
};

/**
 * Résultat de la pile booléenne d'une copie de forme, chaque outil pris à la
 * copie du même rang. R₀ = la forme, Rₖ = Rₖ₋₁ op outilₖ.
 *
 * - Une région se peint en deux teintes (`fg` dedans, `bg` pour les trous de
 *   découpe) : en blanc sur noir elle fait un masque « dedans », en noir sur
 *   un fond blanc un masque « dehors ». L'intersection s'y emboîte en masque.
 * - Le contour est fait des bords de la forme et de chaque outil, chacun
 *   gardé dedans ou dehors à chaque étape qui suit la sienne.
 * - Le remplissage, s'il y en a, est un aplat masqué par la région finale.
 *
 * Tout prend le style de la forme, bords des outils compris. L'opacité
 * interpolée passe sur le groupe : les morceaux qui se recouvrent ne se
 * foncent pas. `<mask>` plutôt que `<clipPath>`, qui ne sait pas garder le
 * dehors ; seul l'intérieur d'un outil compte, pas son trait.
 *
 * ponytail: masques non partagés entre copies, et trait coupé sur la ligne
 * médiane de l'autre forme (léger cran aux jonctions) ; mutualiser si des
 * centaines de copies se font sentir, dilater les masques si le cran gêne.
 */
const createBoolean = (child, steps) => {
  const group = svgNode('g', { opacity: round(child.opacity ?? 1) });
  group.dataset.elementId = child.id;
  const masks = [];
  let serial = 0;

  const solid = (shape, color) => {
    const node = createNode({ ...shape, opacity: 1, outlined: false });
    delete node.dataset.elementId;
    node.setAttribute('fill', color);
    node.setAttribute('stroke', 'none');
    return node;
  };
  const maskOf = (paint, keep) => {
    const mask = svgNode('mask', { id: `bool-${child.id}-${child.copy}-${child.own ?? 0}-${serial++}`, maskUnits: 'userSpaceOnUse' });
    for (const [name, value] of Object.entries(MASK_REGION)) mask.setAttribute(name, round(value));
    if (keep === 'out') mask.append(svgNode('rect', { ...MASK_REGION, fill: '#fff' }));
    mask.append(...(keep === 'out' ? paint('#000', '#fff') : paint('#fff', '#000')));
    masks.push(mask);
    return `url(#${mask.id})`;
  };
  const edge = (shape) => {
    const node = createNode({ ...shape, fill: 'none', opacity: 1 });
    delete node.dataset.elementId;
    return node;
  };

  let region = (fg) => [solid(child, fg)];
  let edges = [edge(child)];
  for (const { shape, op } of steps) {
    const previous = region;
    const tool = (fg) => [solid(shape, fg)];
    const within = maskOf(tool, EDGE_KEEP[op]);
    edges = edges.map((node) => wrap([node], within));
    edges.push(wrap([edge({ ...shape, dash: child.dash, linecap: child.linecap, outlined: child.outlined, gap: child.gap })], maskOf(previous, TOOL_EDGE_KEEP[op])));
    region = {
      union: (fg, bg) => [...previous(fg, bg), ...tool(fg)],
      subtract: (fg, bg) => [...previous(fg, bg), ...tool(bg)],
      intersect: (fg, bg) => [wrap(previous(fg, bg), maskOf(tool, 'in'))],
    }[op];
  }

  const fill =
    child.fill === 'none'
      ? []
      : [svgNode('rect', { ...MASK_REGION, fill: child.fill, stroke: 'none', mask: maskOf(region, 'in') })];
  group.append(...masks, ...fill, ...edges);
  return group;
};

/* Cadre de sélection : écart à la forme, en unités du dessin ; son trait garde
   la même épaisseur à l'écran quel que soit le zoom. Les couleurs viennent de
   l'interface (`style.css`) : un attribut de présentation ne lit pas `var()`. */
const SELECTION_GAP = 8;
const FRAME_COLORS = {
  selection: 'var(--accent, #ee4722)',
  layer: 'var(--accent, #ee4722)',
  hover: 'var(--accent, #ee4722)',
};
/* Échantillons d'un contour courbe : l'écart à la vraie boîte reste sous le
   pixel pour les rayons du plan. */
const CURVE_SAMPLES = 64;

const degrees = (value) => (value * Math.PI) / 180;

/* Points du contour d'une copie rendue, avant rotation et reflet. */
const outlinePoints = (child) => {
  const scale = child.scale ?? 1;
  const rx = clampExtent(child.type, child.rx * scale);
  const ry = clampExtent(child.type, child.ry * scale);
  const { x, y } = child;
  const around = (from, to, radiusX, radiusY) =>
    Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
      const angle = degrees(from + ((to - from) * i) / CURVE_SAMPLES);
      return { x: x + radiusX * Math.sin(angle), y: y - radiusY * Math.cos(angle) };
    });
  switch (SHAPES[child.type].geometry) {
    case 'dot':
      return [{ x, y }];
    case 'line':
    case 'rect':
      return [
        { x: x - rx, y: y - ry },
        { x: x + rx, y: y + ry },
        { x: x - rx, y: y + ry },
        { x: x + rx, y: y - ry },
      ];
    case 'polyline':
      return child.points.map((p) => ({ x: x + p.x * scale, y: y + p.y * scale }));
    case 'polygon':
      /* Les sommets creux d'une étoile sont dans l'enveloppe des pointes. */
      return Array.from({ length: child.sides }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / child.sides;
        return { x: x + rx * Math.cos(angle), y: y + rx * Math.sin(angle) };
      });
    case 'arc': {
      const span = Math.abs(child.end - child.start) >= 360 ? 360 : (((child.end - child.start) % 360) + 360) % 360;
      const points = around(child.start, child.start + span, rx, rx);
      return child.closure === 'sector' ? [...points, { x, y }] : points;
    }
    default:
      return around(0, 360, rx, ry);
  }
};

/**
 * Boîte englobante d'une copie rendue, dans le repère du plan : contour
 * reflété puis tourné comme le fait `createNode`, élargi d'une demi-épaisseur.
 */
export const childBounds = (child) => {
  const rotation = degrees(child.rotation ?? 0);
  const [cos, sin] = [Math.cos(rotation), Math.sin(rotation)];
  let placed = outlinePoints(child).map((p) => {
    const dx = child.flip ? child.x - p.x : p.x - child.x;
    const dy = p.y - child.y;
    return { x: child.x + dx * cos - dy * sin, y: child.y + dx * sin + dy * cos };
  });
  if (child.matrix) {
    placed = placed.map((p) => project(child.matrix, p));
    const v = child.height ? extrusion(child.plane, child.height * (child.scale ?? 1)) : null;
    if (v) placed = [-0.5, 0.5].flatMap((k) => placed.map((p) => ({ x: p.x + v.x * k, y: p.y + v.y * k })));
  }
  const dot = SHAPES[child.type].geometry === 'dot';
  const width = child.strokeWidth * (dot ? (child.scale ?? 1) : 1);
  const half = child.outlined && !dot ? width + ((child.gap ?? 0) * (child.scale ?? 1)) / 2 : width / 2;
  const xs = placed.map((p) => p.x);
  const ys = placed.map((p) => p.y);
  return {
    minX: Math.min(...xs) - half,
    minY: Math.min(...ys) - half,
    maxX: Math.max(...xs) + half,
    maxY: Math.max(...ys) + half,
  };
};

/* Deux boîtes réunies : sans étalement, pour qu'une réduction sur des milliers
   de copies ne dépasse pas la pile d'arguments. */
const union = (a, b) => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/* ponytail: boîte alignée sur les axes, même pour une forme tournée ; un cadre
   qui tourne avec la forme le jour où ça gêne. */
const frame = (box, marker) => {
  const node = guideNode('rect', {
    x: box.minX - SELECTION_GAP,
    y: box.minY - SELECTION_GAP,
    width: box.maxX - box.minX + SELECTION_GAP * 2,
    height: box.maxY - box.minY + SELECTION_GAP * 2,
  });
  node.dataset[marker === 'layer' ? 'selection' : marker] = marker;
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke-width', '1.5');
  node.setAttribute('stroke-dasharray', '6 4');
  node.setAttribute('vector-effect', 'non-scaling-stroke');
  node.setAttribute('pointer-events', 'none');
  node.style.stroke = FRAME_COLORS[marker];
  if (marker === 'hover') node.setAttribute('stroke-opacity', '0.6');
  return node;
};

/* Boîte de la copie source de chaque forme — la première rendue, que la pile
   de modificateurs laisse en place — retenue par rendu pour le survol, qui
   n'a que l'identifiant sous la main. */
const sourceBounds = new WeakMap();

/* Boîte de tout ce que le dernier rendu a dessiné (`null` : rien), pour
   cadrer l'export et la vue. */
const drawings = new WeakMap();
export const drawingBounds = (svgRoot) => drawings.get(svgRoot) ?? null;

/* Cadre de l'export : le dessin, ou le plan de référence s'il est vide. */
const exportFrame = (svgRoot) => {
  const box = drawingBounds(svgRoot);
  if (!box) return { x: 0, y: 0, width: STAGE.width, height: STAGE.height };
  const x = Math.floor(box.minX);
  const y = Math.floor(box.minY);
  return { x, y, width: Math.max(1, Math.ceil(box.maxX) - x), height: Math.max(1, Math.ceil(box.maxY) - y) };
};

const createSelection = (scene, svgRoot, entries) => {
  const ids = selectedIds(scene);
  if (ids.length === 1) {
    const box = sourceBounds.get(svgRoot)?.get(ids[0]);
    return box ? frame(box, 'selection') : null;
  }
  /* Plusieurs formes : un cadre chacune, regroupés pour que survol et export
     les traitent comme un seul `[data-selection]`. */
  if (ids.length > 1) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.dataset.selection = 'selection';
    const boxes = ids.map((id) => sourceBounds.get(svgRoot)?.get(id)).filter(Boolean);
    group.append(...boxes.map((box) => frame(box, 'selection')));
    return group;
  }
  /* Calque sans forme sélectionnée : le cadre entoure toutes ses copies. */
  const box = entries.get(scene.activeLayerId)?.frame;
  return box ? frame(box, 'layer') : null;
};

/** Formes du calque actif dont la copie source touche `box` (repère de l'écran) : le lasso. */
export const elementsInBox = (svgRoot, layer, box) => {
  const bounds = sourceBounds.get(svgRoot);
  return (layer?.elements ?? [])
    .filter((element) => {
      const b = bounds?.get(element.id);
      return b && b.minX <= box.maxX && b.maxX >= box.minX && b.minY <= box.maxY && b.maxY >= box.minY;
    })
    .map((element) => element.id);
};

/** Retire le cadre de survol, où qu'il ait été posé, et rend la sélection. */
export const clearHover = (svgRoot) => {
  for (const node of svgRoot.querySelectorAll('[data-hover]')) node.remove();
  svgRoot.querySelector('[data-selection]')?.removeAttribute('visibility');
};

/**
 * Cadre de survol autour de la copie source d'une forme, qui masque la
 * sélection le temps du survol.
 *
 * Le survol est un état d'écran, pas de scène : le prochain rendu l'efface,
 * et c'est à l'appelant de le reposer.
 */
export const showHover = (svgRoot, elementId) => {
  clearHover(svgRoot);
  const box = sourceBounds.get(svgRoot)?.get(elementId);
  if (!box) return;
  /* Un seul cadre à la fois : la forme survolée, pas celle sélectionnée. */
  svgRoot.querySelector('[data-selection]')?.setAttribute('visibility', 'hidden');
  svgRoot.append(frame(box, 'hover'));
};

export const round = (value) => String(Math.round(value * 1000) / 1000);

const rotateAbout = (degrees, { x, y }) => `rotate(${round(degrees)} ${round(x)} ${round(y)})`;

/* Reflet par l'axe vertical passant par le centre de la forme. */
const flipAbout = ({ x, y }) => `translate(${round(x)} ${round(y)}) scale(-1 1) translate(${round(-x)} ${round(-y)})`;

/**
 * Sérialise le nœud affiché en document SVG autonome.
 *
 * Le `<svg>` du DOM est cloné avant d'y poser les attributs de document : la
 * racine vivante garde ses attributs d'interface (id, role, aria-label) et le
 * fichier n'embarque que ce qui a un sens hors de la page — les repères du
 * modificateur, la sélection et le survol en sont donc retirés.
 */
/* Ce que l'écran pose pour lui-même : le style de la racine (zoom, grille), les
   marqueurs `data-*` du curseur et de l'outil, la cible de clic, et les
   opacités pleines, valeur par défaut qui ne fait que grossir le fichier. */
const stripScreenAttributes = (root) => {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const { name, value } of [...node.attributes]) {
      const opaque = (name === 'opacity' || name === 'fill-opacity' || name === 'stroke-opacity') && value === '1';
      if (name === 'style' || name === 'pointer-events' || name.startsWith('data-') || opaque) {
        node.removeAttribute(name);
      }
    }
  }
};

export const toSvgDocument = (svgRoot) => {
  const clone = svgRoot.cloneNode(true);
  clone.querySelector('[data-guides]')?.remove();
  clone.querySelector('[data-handles]')?.remove();
  clone.querySelector('[data-selection]')?.remove();
  clearHover(clone);
  clone.removeAttribute('id');
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  stripScreenAttributes(clone);
  clone.setAttribute('xmlns', SVG_NS);
  const { x, y, width, height } = exportFrame(svgRoot);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
};

/**
 * Rastérise le document SVG exporté en PNG, ajusté pour que son plus grand
 * côté fasse `size` px quelle que soit la taille du dessin. `square` : image
 * `size` × `size`, dessin centré dedans. Passe par une `<img>` et un
 * `<canvas>` : même source que l'export SVG, donc même dessin, repères
 * retirés. Sans fond dans le document, le PNG est transparent.
 *
 * @returns {Promise<Blob>}
 */
export const toPng = (svgRoot, size, square = false) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([toSvgDocument(svgRoot)], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = exportFrame(svgRoot);
      const scale = size / Math.max(width, height);
      const drawn = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
      const canvas = document.createElement('canvas');
      canvas.width = square ? size : drawn.width;
      canvas.height = square ? size : drawn.height;
      const x = (canvas.width - drawn.width) / 2;
      const y = (canvas.height - drawn.height) / 2;
      canvas.getContext('2d').drawImage(image, x, y, drawn.width, drawn.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image trop grande pour le navigateur.'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('le dessin n’a pas pu être rastérisé.'));
    };
    image.src = url;
  });
