import { getRenderedChildren, SHAPES, STAGE } from './scene.js';

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
};

const createNode = (child) => {
  const scale = child.scale ?? 1;
  const rx = Math.max(0, child.rx * scale);
  const ry = Math.max(0, child.ry * scale);
  const geometry = SHAPES[child.type].geometry;

  const node = document.createElementNS(SVG_NS, geometry);
  if (geometry === 'rect') {
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
  node.setAttribute('stroke-width', round(child.strokeWidth));
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
 * fichier n'embarque que ce qui a un sens hors de la page.
 */
export const toSvgDocument = (svgRoot) => {
  const clone = svgRoot.cloneNode(true);
  clone.removeAttribute('id');
  clone.removeAttribute('role');
  clone.removeAttribute('aria-label');
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(STAGE.width));
  clone.setAttribute('height', String(STAGE.height));
  clone.setAttribute('viewBox', `0 0 ${STAGE.width} ${STAGE.height}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
};
