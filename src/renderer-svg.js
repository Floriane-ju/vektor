import { clampExtent, getActiveLayer, getRenderedChildren, SHAPES, STAGE } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Rend la scène dans le `<svg>` du DOM.
 *
 * Ce nœud est à la fois le preview et la source de l'export : il n'y a qu'un
 * seul moteur de rendu, donc rien à garder en phase entre l'écran et le
 * fichier.
 */
export const render = (scene, svgRoot) => {
  svgRoot.replaceChildren();

  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    const children = getRenderedChildren(layer);
    if (children.length === 0) continue;

    const group = document.createElementNS(SVG_NS, 'g');
    group.dataset.layerId = layer.id;
    for (const child of children) group.append(createNode(child));
    svgRoot.append(group);
  }

  const guides = createGuides(getActiveLayer(scene));
  if (guides) svgRoot.append(guides);
};

/* Demi-longueur des branches de la croix, et rayon de l'anneau qui marque le
   centre. */
const GUIDE_MARK = 14;

const guideNode = (geometry, attrs) => {
  const node = document.createElementNS(SVG_NS, geometry);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, round(value));
  return node;
};

const guideLine = (x1, y1, x2, y2) => guideNode('line', { x1, y1, x2, y2 });

/** Marque un centre de transformation : croix + anneau. */
const guideCenter = ({ center }) => [
  guideLine(center.x - GUIDE_MARK, center.y, center.x + GUIDE_MARK, center.y),
  guideLine(center.x, center.y - GUIDE_MARK, center.x, center.y + GUIDE_MARK),
  guideNode('circle', { cx: center.x, cy: center.y, r: GUIDE_MARK }),
];

/** Axe de symétrie d'un miroir : la seule chose que `n` ne déplace plus. */
const mirrorGuides = (axis) => (layer) =>
  axis === 'x'
    ? [guideLine(layer.center.x, 0, layer.center.x, STAGE.height)]
    : [guideLine(0, layer.center.y, STAGE.width, layer.center.y)];

/**
 * Repères propres à chaque modificateur : l'axe pour un miroir, le centre de
 * rotation pour l'axial et la spirale.
 *
 * `none` et `step` n'y figurent pas : le premier ne duplique rien, le second
 * translate sans pivot ni axe — il n'a pas de lieu à montrer.
 */
const GUIDES = {
  mirrorH: mirrorGuides('x'),
  mirrorV: mirrorGuides('y'),
  axial: guideCenter,
  spiral: guideCenter,
};

/**
 * Repères du modificateur du calque actif.
 *
 * Ils vivent dans le `<svg>` de la scène : même viewBox, donc ils restent
 * alignés sous le zoom sans qu'aucune coordonnée soit recalculée. `toSvgDocument`
 * les retire — ce sont des repères d'écran, pas du dessin.
 */
const createGuides = (layer) => {
  const build = layer?.visible ? GUIDES[layer.modifier.type] : null;
  if (!build) return null;

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.guides = layer.modifier.type;
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', '#7dd3c0');
  group.setAttribute('stroke-width', '1');
  group.setAttribute('stroke-opacity', '0.45');
  group.setAttribute('stroke-dasharray', '6 6');
  /* Le trait garde son épaisseur à l'écran quel que soit le zoom : un repère
     qui grossit avec le dessin finit par le cacher. */
  group.setAttribute('vector-effect', 'non-scaling-stroke');
  /* Un glissement sur un repère dessine comme ailleurs. */
  group.setAttribute('pointer-events', 'none');
  group.append(...build(layer));
  return group;
};

const createNode = (child) => {
  const scale = child.scale ?? 1;
  const rx = clampExtent(child.type, child.rx * scale);
  const ry = clampExtent(child.type, child.ry * scale);
  const geometry = SHAPES[child.type].geometry;

  const node = document.createElementNS(SVG_NS, geometry === 'dot' ? 'line' : geometry);
  let strokeWidth = child.strokeWidth;
  if (geometry === 'dot') {
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
  } else {
    node.setAttribute('cx', round(child.x));
    node.setAttribute('cy', round(child.y));
    node.setAttribute('r', round(rx));
  }

  node.setAttribute('fill', child.fill);
  node.setAttribute('stroke', child.stroke);
  node.setAttribute('stroke-width', round(strokeWidth));
  node.setAttribute('fill-opacity', round(child.opacity ?? 1));
  node.setAttribute('stroke-opacity', round(child.opacity ?? 1));
  return node;
};

const round = (value) => String(Math.round(value * 1000) / 1000);

/**
 * Sérialise le nœud affiché en document SVG autonome.
 *
 * Le `<svg>` du DOM est cloné avant d'y poser les attributs de document : la
 * racine vivante garde ses attributs d'interface (id, role, aria-label) et le
 * fichier n'embarque que ce qui a un sens hors de la page — les repères du
 * modificateur en sont donc retirés.
 */
export const toSvgDocument = (svgRoot) => {
  const clone = svgRoot.cloneNode(true);
  clone.querySelector('[data-guides]')?.remove();
  clone.removeAttribute('id');
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(STAGE.width));
  clone.setAttribute('height', String(STAGE.height));
  clone.setAttribute('viewBox', `0 0 ${STAGE.width} ${STAGE.height}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
};
