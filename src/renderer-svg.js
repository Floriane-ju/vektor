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

  const selection = createSelection(scene, svgRoot);
  if (selection) svgRoot.append(selection);
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

  /* Orientation de la copie et rotation propre, autour du centre de la forme
     après le déplacement des modificateurs : la géométrie émise reste celle de
     la forme droite. Le reflet passe avant l'angle. */
  const transform = [
    child.rotation ? rotateAbout(child.rotation, child) : '',
    child.flip ? flipAbout(child) : '',
  ].filter(Boolean);
  if (transform.length > 0) node.setAttribute('transform', transform.join(' '));
  node.setAttribute('fill', child.fill);
  node.setAttribute('stroke', child.stroke);
  node.setAttribute('stroke-width', round(strokeWidth));
  node.setAttribute('fill-opacity', round(child.opacity ?? 1));
  node.setAttribute('stroke-opacity', round(child.opacity ?? 1));
  return node;
};

/* Anneau de sélection : couleur, écart à la forme et épaisseur, en unités du
   dessin. ponytail: il grossit avec le zoom, comme le dessin ; le diviser par
   le facteur de zoom si ça gêne. */
/* L'accent de l'interface : un attribut de présentation ne lit pas `var()`,
   d'où la peinture posée en style dans `silhouette`. */
const SELECTION_COLOR = 'var(--accent)';
const SELECTION_GAP = 4;
const SELECTION_WIDTH = 4;

/* Une ligne ou un tracé ouvert n'a pas d'intérieur : le remplir fermerait la
   forme d'une corde invisible. */
const isClosed = (node) => {
  const tag = node.tagName.toLowerCase();
  if (tag === 'path') return /z\s*$/i.test(node.getAttribute('d') ?? '');
  return tag !== 'line' && tag !== 'polyline';
};

/* Copie nue d'un nœud rendu, grossie de `grow` de chaque côté et peinte d'une
   seule couleur : le trait élargi déborde de la forme d'autant. */
const silhouette = (node, color, grow) => {
  const clone = node.cloneNode();
  for (const name of ['data-element-id', 'transform', 'fill-opacity', 'stroke-opacity']) {
    clone.removeAttribute(name);
  }
  const width = Number(node.getAttribute('stroke-width')) || 0;
  clone.setAttribute('stroke-width', round(width + grow * 2));
  clone.style.stroke = color;
  clone.style.fill = isClosed(node) ? color : 'none';
  return clone;
};

/**
 * Anneau détaché autour d'un nœud rendu : sa silhouette élargie, évidée par un
 * masque de la silhouette à peine moins large. Rien n'est repeint sur la forme
 * elle-même, ni couleur ni opacité, et ce qui est dessous reste visible par le
 * liseré.
 *
 * La rotation est portée par le groupe, pas par les silhouettes : le masque se
 * lit dans l'espace de l'élément qui le référence, elle s'appliquerait deux fois.
 */
const outline = (node, marker) => {
  const id = `outline-${marker}`;
  const wrapper = document.createElementNS(SVG_NS, 'g');
  wrapper.dataset[marker] = '';
  wrapper.setAttribute('pointer-events', 'none');

  /* Bornes larges : sous une rotation, le repère du masque tourne aussi. */
  const bounds = { x: -STAGE.width, y: -STAGE.height, width: STAGE.width * 3, height: STAGE.height * 3 };
  const mask = guideNode('mask', bounds);
  mask.id = id;
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  const keep = guideNode('rect', bounds);
  keep.setAttribute('fill', '#fff');
  mask.append(keep, silhouette(node, '#000', SELECTION_GAP));

  const ring = document.createElementNS(SVG_NS, 'g');
  const transform = node.getAttribute('transform');
  if (transform) ring.setAttribute('transform', transform);
  ring.setAttribute('mask', `url(#${id})`);
  ring.append(silhouette(node, SELECTION_COLOR, SELECTION_GAP + SELECTION_WIDTH));

  wrapper.append(mask, ring);
  return wrapper;
};

/* Copie source d'une forme : la première rendue, que la pile de modificateurs
   laisse en place. Le contour ne va que sur elle, pas sur les copies. */
const sourceNode = (svgRoot, elementId) =>
  elementId ? svgRoot.querySelector(`[data-element-id="${CSS.escape(elementId)}"]`) : null;

const createSelection = (scene, svgRoot) => {
  const source = sourceNode(svgRoot, scene.activeElementId);
  return source ? outline(source, 'selection') : null;
};

/** Retire le contour de survol, où qu'il ait été posé, et rend la sélection. */
export const clearHover = (svgRoot) => {
  for (const node of svgRoot.querySelectorAll('[data-hover]')) node.remove();
  svgRoot.querySelector('[data-selection]')?.removeAttribute('visibility');
};

/**
 * Contour de survol sur la copie source d'une forme, dessiné comme la
 * sélection, qu'il masque le temps du survol.
 *
 * Le survol est un état d'écran, pas de scène : le prochain rendu l'efface,
 * et c'est à l'appelant de le reposer.
 */
export const showHover = (svgRoot, elementId) => {
  clearHover(svgRoot);
  const source = sourceNode(svgRoot, elementId);
  if (!source) return;
  /* Un seul accent à la fois : la forme survolée, pas celle sélectionnée. */
  svgRoot.querySelector('[data-selection]')?.setAttribute('visibility', 'hidden');
  svgRoot.append(outline(source, 'hover'));
};

const round = (value) => String(Math.round(value * 1000) / 1000);

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
export const toSvgDocument = (svgRoot) => {
  const clone = svgRoot.cloneNode(true);
  clone.querySelector('[data-guides]')?.remove();
  clone.querySelector('[data-handles]')?.remove();
  clone.querySelector('[data-selection]')?.remove();
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
