/* Couche d'écran du plan : repères des pivots, cadres de sélection et de
   survol, poignées de sommets et de transformation. État d'écran, refait à
   chaque rendu (`render` dans `renderer-svg.js`), retiré à l'export. */
import { absolutePoints, activePlane, getActiveElement, getActiveLayer, pivotOf, selectedIds, SHAPES } from './scene.js';
import { axisDirection } from './modifiers.js';
import { planeMatrix } from './plane.js';
import { createNode, MASK_REGION, renderedDot, rotateAbout, round, svgNode } from './renderer-svg.js';
import { drawPlane } from './renderer-plane.js';

/* Chrome d'écran (repères, cadres, poignées, lasso) : couleurs du thème
   (`style.css`), posées en `style` — un attribut de présentation ne lit pas
   `var()`. Épaisseurs à l'écran (`non-scaling-stroke`) et tirets. */
export const CHROME = {
  accent: 'var(--accent)',
  knob: 'var(--stage)',
  guide: 'var(--guide)',
  width: '1.5',
  handleWidth: '2',
  guideWidth: '1',
  guideOpacity: '0.45',
  hoverOpacity: '0.6',
  guideDash: '6 6',
  frameDash: '6 4',
  sketchDash: '4 4',
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
export const createHandles = (scene) => {
  const element = getActiveElement(scene);
  const layer = scene.layers.find((candidate) => candidate.elements.includes(element));
  if (!element || SHAPES[element.type].geometry !== 'polyline' || !layer?.visible) return null;

  const group = svgNode('g');
  group.dataset.handles = element.id;
  group.style.fill = CHROME.knob;
  group.style.stroke = CHROME.accent;
  group.setAttribute('stroke-width', CHROME.handleWidth);
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

/* `svgNode` aux coordonnées arrondies, comme le reste du dessin. */
const guideNode = (geometry, attrs) =>
  svgNode(geometry, Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, round(value)])));

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
export const createGuides = (layer, element = null) => {
  const stages = (owner) => owner.modifiers.map((modifier, index) => ({ modifier, index, owner }));
  /* La forme sélectionnée montre aussi les étages de sa propre pile. */
  const marked = layer?.visible
    ? [...stages(layer), ...(element ? stages(element) : [])].filter(({ modifier }) =>
        Object.hasOwn(GUIDES, modifier.type),
      )
    : [];
  if (marked.length === 0) return null;

  const group = svgNode('g');
  group.dataset.guides = marked.map(({ modifier }) => modifier.type).join(' ');
  group.setAttribute('fill', 'none');
  /* Gris neutre : un repère ne doit pas se confondre avec un trait dessiné,
     dont l'accent est la couleur par défaut. */
  group.style.stroke = CHROME.guide;
  group.setAttribute('stroke-width', CHROME.guideWidth);
  group.setAttribute('stroke-opacity', CHROME.guideOpacity);
  group.setAttribute('stroke-dasharray', CHROME.guideDash);
  /* Le trait garde son épaisseur à l'écran quel que soit le zoom : un repère
     qui grossit avec le dessin finit par le cacher. */
  group.setAttribute('vector-effect', 'non-scaling-stroke');
  /* Seules les zones de saisie des pivots captent le pointeur. */
  group.setAttribute('pointer-events', 'none');
  if (activePlane(layer)) group.setAttribute('transform', planeTransform(layer));
  group.append(
    ...marked.map(({ modifier, index, owner }) => {
      const pivot = svgNode('g');
      pivot.dataset.pivot = String(index);
      if (owner !== layer) pivot.dataset.pivotOwner = owner.id;
      pivot.append(...GUIDES[modifier.type](pivotOf(layer, index, owner), modifier));
      return pivot;
    }),
  );
  return group;
};

/* Cadre de sélection : écart à la forme, en unités du dessin ; son trait garde
   la même épaisseur à l'écran quel que soit le zoom. */
const SELECTION_GAP = 8;

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
  node.setAttribute('stroke-width', CHROME.width);
  node.setAttribute('stroke-dasharray', CHROME.frameDash);
  node.setAttribute('vector-effect', 'non-scaling-stroke');
  node.setAttribute('pointer-events', 'none');
  node.style.stroke = CHROME.accent;
  if (marker === 'hover') node.setAttribute('stroke-opacity', CHROME.hoverOpacity);
  return node;
};

/* Boîte de la copie source de chaque forme — la première rendue, que la pile
   de modificateurs laisse en place — retenue par rendu pour le survol, qui
   n'a que l'identifiant sous la main. */
export const sourceBounds = new WeakMap();

/* Cadre d'une forme sélectionnée, saisissable dans toute sa surface
   (`data-grab`) : un point ou une forme fine se déplace sans viser son trait. */
const grabFrame = (box, id) => {
  const node = frame(box, 'selection');
  node.dataset.grab = id;
  node.setAttribute('pointer-events', 'all');
  return node;
};

export const createSelection = (scene, svgRoot, entries) => {
  const ids = selectedIds(scene);
  if (ids.length === 1) {
    const box = sourceBounds.get(svgRoot)?.get(ids[0]);
    return box ? grabFrame(box, ids[0]) : null;
  }
  /* Plusieurs formes : un cadre chacune, regroupés pour que survol et export
     les traitent comme un seul `[data-selection]`. */
  if (ids.length > 1) {
    const group = svgNode('g');
    group.dataset.selection = 'selection';
    for (const id of ids) {
      const box = sourceBounds.get(svgRoot)?.get(id);
      if (box) group.append(grabFrame(box, id));
    }
    return group;
  }
  /* Calque sans forme sélectionnée : le cadre entoure toutes ses copies. */
  const box = entries.get(scene.activeLayerId)?.frame;
  return box ? frame(box, 'layer') : null;
};

/* Poignées du cadre, en unités du dessin : demi-côté d'un carré, écart du bouton de rotation. */
const KNOB = 5;
const ROTATE_OFFSET = 24;
/* Rang de chaque poignée sur la boîte : 0 = min, 1 = milieu, 2 = max. */
const RESIZE_KNOBS = { nw: [0, 0], n: [1, 0], ne: [2, 0], e: [2, 1], se: [2, 2], s: [1, 2], sw: [0, 2], w: [0, 1] };

/**
 * Poignées de transformation de la forme active, seule sélectionnée, sur le
 * cadre de sa copie source : `data-resize` = côté ou coin (redimensionne),
 * `data-rotate` (tourne) — la toolbar les saisit (`transformGesture`). Ni sur un
 * point, ni sur un calque masqué ou verrouillé ; l'export les retire.
 */
export const createTransformHandles = (scene, svgRoot) => {
  const element = getActiveElement(scene);
  const layer = getActiveLayer(scene);
  const box = element && sourceBounds.get(svgRoot)?.get(element.id);
  if (!box || selectedIds(scene).length !== 1 || SHAPES[element.type].geometry === 'dot') return null;
  if (!layer?.visible || layer.locked || !layer.elements.includes(element)) return null;
  const [x0, y0] = [box.minX - SELECTION_GAP, box.minY - SELECTION_GAP];
  const [x2, y2] = [box.maxX + SELECTION_GAP, box.maxY + SELECTION_GAP];
  const at = (rank, low, high) => low + ((high - low) * rank) / 2;
  const group = svgNode('g');
  group.dataset.transform = element.id;
  group.style.fill = CHROME.knob;
  group.style.stroke = CHROME.accent;
  group.setAttribute('stroke-width', CHROME.width);
  group.setAttribute('vector-effect', 'non-scaling-stroke');
  const top = { x: (x0 + x2) / 2, y: y0 };
  const stem = guideLine(top.x, top.y, top.x, top.y - ROTATE_OFFSET);
  stem.setAttribute('pointer-events', 'none');
  const rotate = guideNode('circle', { cx: top.x, cy: top.y - ROTATE_OFFSET, r: KNOB });
  rotate.dataset.rotate = '';
  group.append(stem, rotate);
  for (const [side, [i, j]] of Object.entries(RESIZE_KNOBS)) {
    const x = at(i, x0, x2);
    const y = at(j, y0, y2);
    const knob = guideNode('rect', { x: x - KNOB, y: y - KNOB, width: KNOB * 2, height: KNOB * 2 });
    knob.dataset.resize = side;
    group.append(knob);
  }
  return group;
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
  delete svgRoot.dataset.focus;
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

/**
 * Pointeur dans le cadre de saisie d'une forme : le dessin passe à 80 %
 * (`data-focus`, voir style.css), sa copie d'origine reprise par-dessus à
 * pleine opacité — pour un point relié, le point au départ de sa chaîne, la
 * chaîne restant atténuée. État d'écran comme le survol : le prochain rendu
 * l'efface.
 *
 * ponytail: la copie reprise passe devant ce qui la cachait (calque du dessus,
 * volumes du même bloc 3D) le temps du survol.
 */
export const showOrigin = (svgRoot, elementId) => {
  clearHover(svgRoot);
  const nodes = [...svgRoot.querySelectorAll(`[data-layer-id] [data-element-id="${elementId}"][data-origin]`)].filter(
    (node) => !node.closest('mask') && !node.parentElement.closest('[data-origin]'),
  );
  const dot = renderedDot(svgRoot, elementId);
  if (dot) nodes.push(dot.matrix ? drawPlane([dot]).node : createNode(dot));
  if (nodes.length === 0) return;
  const group = svgNode('g', { 'pointer-events': 'none' });
  group.dataset.hover = 'origin';
  group.dataset.for = elementId;
  group.append(...nodes.map((node) => (node.parentNode ? node.cloneNode(true) : node)));
  svgRoot.dataset.focus = '';
  svgRoot.append(group);
};
