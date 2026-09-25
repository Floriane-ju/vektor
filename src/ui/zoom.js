import { STAGE } from '../scene.js';
import { drawingBounds } from '../renderer-svg.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const STEP = 1.25;
/* Marge autour du dessin quand on ajuste la vue, en pixels écran. */
const FIT_MARGIN = 32;

export const clampZoom = (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * Vue du plan de travail infini.
 *
 * Le `<svg>` couvre l'écran ; la vue n'est que son `viewBox` : `x, y` = point
 * de la scène au coin haut gauche, `zoom` = pixels par unité. Les coordonnées
 * du dessin ne bougent pas, et `toStagePoint` (qui passe par la CTM) suit.
 * Molette = déplacement, Ctrl/⌘ + molette ou pincement = zoom sous le pointeur.
 *
 * ponytail: pas de glisser à la barre d'espace ni au bouton du milieu ; la
 * molette et le trackpad suffisent tant qu'on ne le réclame pas.
 */
export const mountZoom = ({ svgRoot, container }) => {
  let view = { x: 0, y: 0, zoom: 1 };
  const listeners = [];

  const label = document.createElement('output');
  label.className = 'zoom-level';

  /* Zone visible, en unités de la scène. */
  const visible = () => ({
    x0: view.x,
    y0: view.y,
    x1: view.x + (svgRoot.clientWidth || STAGE.width) / view.zoom,
    y1: view.y + (svgRoot.clientHeight || STAGE.height) / view.zoom,
  });

  const apply = (next) => {
    view = next;
    const { x0, y0, x1, y1 } = visible();
    svgRoot.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v * 100) / 100).join(' '));
    label.textContent = `${Math.round(view.zoom * 100)} %`;
    for (const listener of listeners) listener(visible());
  };

  /* Garde sous `anchor` (coordonnées écran) le même point de la scène. */
  const zoomAt = (next, anchor) => {
    const box = svgRoot.getBoundingClientRect();
    const sx = (anchor?.x ?? box.left + box.width / 2) - box.left;
    const sy = (anchor?.y ?? box.top + box.height / 2) - box.top;
    const zoom = clampZoom(next);
    apply({ x: view.x + sx / view.zoom - sx / zoom, y: view.y + sy / view.zoom - sy / zoom, zoom });
  };

  /* Cadre le dessin (ou, vide, le carré de référence) dans la zone libre
     entre les panneaux. */
  const fit = () => {
    const root = getComputedStyle(document.documentElement);
    const gutter = (side) => (parseFloat(root.getPropertyValue(`--gutter-${side}`)) || 0) + FIT_MARGIN;
    const width = Math.max(1, (svgRoot.clientWidth || STAGE.width) - gutter('left') - gutter('right'));
    const height = Math.max(1, (svgRoot.clientHeight || STAGE.height) - gutter('top') - gutter('bottom'));
    const box = drawingBounds(svgRoot) ?? { minX: 0, minY: 0, maxX: STAGE.width, maxY: STAGE.height };
    const w = Math.max(1, box.maxX - box.minX);
    const h = Math.max(1, box.maxY - box.minY);
    const zoom = clampZoom(Math.min(width / w, height / h));
    apply({
      x: (box.minX + box.maxX) / 2 - (gutter('left') + width / 2) / zoom,
      y: (box.minY + box.maxY) / 2 - (gutter('top') + height / 2) / zoom,
      zoom,
    });
  };

  const button = (text, title, onClick) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = text.length === 1 ? 'pill-btn is-square' : 'pill-btn';
    node.textContent = text;
    node.title = title;
    node.setAttribute('aria-label', title);
    node.addEventListener('click', onClick);
    return node;
  };

  const group = document.createElement('div');
  group.className = 'zoom-controls';
  group.append(
    button('−', 'Dézoomer', () => zoomAt(view.zoom / STEP)),
    label,
    button('+', 'Zoomer', () => zoomAt(view.zoom * STEP)),
    button('Ajuster', 'Cadrer le dessin', fit),
  );
  container.append(group);

  /* Ctrl/⌘ + molette, et le pincement trackpad (émis comme wheel + ctrlKey) ;
     sinon la molette déplace la vue. */
  svgRoot.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(view.zoom * Math.exp(-event.deltaY * 0.01), { x: event.clientX, y: event.clientY });
        return;
      }
      apply({ ...view, x: view.x + event.deltaX / view.zoom, y: view.y + event.deltaY / view.zoom });
    },
    { passive: false },
  );

  window.addEventListener('keydown', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.key === '+' || event.key === '=') zoomAt(view.zoom * STEP);
    else if (event.key === '-') zoomAt(view.zoom / STEP);
    else if (event.key === '0') fit();
    else return;
    event.preventDefault();
  });

  /* Le coin haut gauche reste en place ; la vue s'étend ou se réduit. */
  window.addEventListener('resize', () => apply(view));

  return {
    fit,
    visible,
    /** Appelé à chaque changement de vue avec la zone visible. */
    onChange: (listener) => listeners.push(listener),
  };
};
