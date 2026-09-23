import {
  absolutePoints,
  clampExtent,
  getActiveElement,
  getActiveLayer,
  getRenderedChildren,
  SHAPES,
  STAGE,
} from './scene.js';

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
  const handles = createHandles(scene);
  if (handles) svgRoot.append(handles);
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
  group.setAttribute('fill', '#ffffff');
  group.setAttribute('stroke', '#1f2430');
  group.setAttribute('stroke-width', '1');
  group.setAttribute('vector-effect', 'non-scaling-stroke');
  if (element.rotation) group.setAttribute('transform', rotateAbout(element.rotation, element));
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
const guideCenter = ({ center }) => {
  const cross = [
    guideLine(center.x - GUIDE_MARK, center.y, center.x + GUIDE_MARK, center.y),
    guideLine(center.x, center.y - GUIDE_MARK, center.x, center.y + GUIDE_MARK),
  ];
  for (const branch of cross) branch.setAttribute('stroke-dasharray', 'none');
  return cross;
};

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
 * Repères de la pile de modificateurs du calque actif : chaque modificateur qui
 * a un lieu à montrer y pose le sien, dans l'ordre de la pile.
 *
 * Ils vivent dans le `<svg>` de la scène : même viewBox, donc ils restent
 * alignés sous le zoom sans qu'aucune coordonnée soit recalculée. `toSvgDocument`
 * les retire — ce sont des repères d'écran, pas du dessin.
 */
const createGuides = (layer) => {
  const marked = layer?.visible
    ? layer.modifiers.filter((modifier) => Object.hasOwn(GUIDES, modifier.type))
    : [];
  if (marked.length === 0) return null;

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.guides = marked.map((modifier) => modifier.type).join(' ');
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
  /* Un glissement sur un repère dessine comme ailleurs. */
  group.setAttribute('pointer-events', 'none');
  group.append(...marked.flatMap((modifier) => GUIDES[modifier.type](layer, modifier)));
  return group;
};

/**
 * Sommets d'un polygone régulier, le premier en haut. Sous 100 % de `inner`,
 * un sommet creux s'intercale entre deux sommets : l'étoile. À 100 % il
 * tomberait sur le côté, donc il est omis — même dessin, moitié moins de points.
 */
export const polygonPoints = (cx, cy, radius, sides, inner) => {
  const star = inner < 100;
  const count = star ? sides * 2 : sides;
  const hollow = radius * Math.cos(Math.PI / sides) * (inner / 100);
  return Array.from({ length: count }, (_, i) => {
    const r = star && i % 2 === 1 ? hollow : radius;
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return `${round(cx + r * Math.cos(angle))},${round(cy + r * Math.sin(angle))}`;
  }).join(' ');
};

/**
 * Tracé `d` d'un arc de `start` à `end` (degrés, 0 en haut, sens horaire).
 *
 * Un tour complet ne s'écrit pas en une commande `A` — ses deux bouts
 * confondus ne disent plus quel cercle passer — donc il se fait en deux
 * demi-arcs et se ferme, quel que soit le mode : ni rayon au centre ni corde
 * n'y auraient de sens.
 */
export const arcPath = (cx, cy, radius, start, end, closure) => {
  const at = (degrees) => {
    const angle = (degrees * Math.PI) / 180;
    return `${round(cx + radius * Math.sin(angle))},${round(cy - radius * Math.cos(angle))}`;
  };
  const r = `${round(radius)},${round(radius)}`;
  const span = end - start;
  if (Math.abs(span) >= 360) {
    return `M${at(start)} A${r} 0 0 1 ${at(start + 180)} A${r} 0 0 1 ${at(start)} Z`;
  }
  /* Un arc à rebours (270 → 90) court quand même en sens horaire. */
  const sweep = ((span % 360) + 360) % 360;
  const arc = `M${at(start)} A${r} 0 ${sweep > 180 ? 1 : 0} 1 ${at(start + sweep)}`;
  if (closure === 'sector') return `${arc} L${round(cx)},${round(cy)} Z`;
  return closure === 'chord' ? `${arc} Z` : arc;
};

const createNode = (child) => {
  const scale = child.scale ?? 1;
  const rx = clampExtent(child.type, child.rx * scale);
  const ry = clampExtent(child.type, child.ry * scale);
  const geometry = SHAPES[child.type].geometry;

  const tag =
    { dot: 'line', arc: 'path', polyline: child.closed ? 'polygon' : 'polyline' }[geometry] ?? geometry;
  const node = document.createElementNS(SVG_NS, tag);
  node.dataset.elementId = child.id;
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
  } else {
    node.setAttribute('cx', round(child.x));
    node.setAttribute('cy', round(child.y));
    node.setAttribute('r', round(rx));
  }

  /* Rotation propre, autour du centre de la forme après le déplacement des
     modificateurs : la géométrie émise reste celle de la forme droite. */
  if (child.rotation) node.setAttribute('transform', rotateAbout(child.rotation, child));
  node.setAttribute('fill', child.fill);
  node.setAttribute('stroke', child.stroke);
  node.setAttribute('stroke-width', round(strokeWidth));
  node.setAttribute('fill-opacity', round(child.opacity ?? 1));
  node.setAttribute('stroke-opacity', round(child.opacity ?? 1));
  return node;
};

/* Part de noir ou de blanc mêlée à la couleur de la forme survolée. */
const HIGHLIGHT_MIX = 0.55;

/* Au-delà, une couleur est jugée claire et s'assombrit pour ressortir. */
const LIGHT_LUMINANCE = 0.45;

const parseHex = (color) => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color ?? '');
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
};

/* Luminance relative WCAG : le vert pèse bien plus que le bleu à l'œil. */
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Couleur de surlignage d'une peinture : la même teinte, éclaircie si elle est
 * foncée, assombrie si elle est claire, pour garder du contraste avec la forme.
 * Ce qui n'est pas un hexadécimal (`none`…) passe tel quel.
 */
export const highlightColor = (color) => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const target = luminance(rgb) > LIGHT_LUMINANCE ? 0 : 255;
  return `#${rgb
    .map((channel) => Math.round(channel + (target - channel) * HIGHLIGHT_MIX).toString(16).padStart(2, '0'))
    .join('')}`;
};

/** Retire le surlignage de survol, où qu'il ait été posé. */
export const clearHover = (svgRoot) => {
  for (const node of svgRoot.querySelectorAll('[data-hover]')) node.remove();
};

/**
 * Surligne des nœuds déjà rendus : un clone de chacun par-dessus la scène,
 * repeint d'une nuance de sa propre couleur.
 *
 * Le survol est un état d'écran, pas de scène : le prochain rendu l'efface,
 * et c'est à l'appelant de le reposer.
 */
export const showHover = (svgRoot, nodes) => {
  clearHover(svgRoot);
  for (const node of nodes) {
    const overlay = node.cloneNode();
    delete overlay.dataset.elementId;
    overlay.dataset.hover = '';
    overlay.setAttribute('pointer-events', 'none');
    overlay.setAttribute('fill', highlightColor(node.getAttribute('fill')));
    overlay.setAttribute('stroke', highlightColor(node.getAttribute('stroke')));
    svgRoot.append(overlay);
  }
};

/** Toutes les copies dessinées d'une forme : elles portent l'id de leur source. */
export const renderedNodes = (svgRoot, elementId) =>
  svgRoot.querySelectorAll(`[data-element-id="${CSS.escape(elementId)}"]`);

const round = (value) => String(Math.round(value * 1000) / 1000);

const rotateAbout = (degrees, { x, y }) => `rotate(${round(degrees)} ${round(x)} ${round(y)})`;

/**
 * Sérialise le nœud affiché en document SVG autonome.
 *
 * Le `<svg>` du DOM est cloné avant d'y poser les attributs de document : la
 * racine vivante garde ses attributs d'interface (id, role, aria-label) et le
 * fichier n'embarque que ce qui a un sens hors de la page — les repères du
 * modificateur et le survol du curseur en sont donc retirés.
 */
export const toSvgDocument = (svgRoot) => {
  const clone = svgRoot.cloneNode(true);
  clone.querySelector('[data-guides]')?.remove();
  clone.querySelector('[data-handles]')?.remove();
  clearHover(clone);
  clone.removeAttribute('id');
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(STAGE.width));
  clone.setAttribute('height', String(STAGE.height));
  clone.setAttribute('viewBox', `0 0 ${STAGE.width} ${STAGE.height}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
};
