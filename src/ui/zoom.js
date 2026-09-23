import { STAGE } from '../scene.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const STEP = 1.25;

export const clampZoom = (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * Zoom du plan de travail.
 *
 * Le zoom ne touche que la taille CSS du `<svg>` : le `viewBox` reste celui de
 * la scène, donc l'export et `toStagePoint` (qui passe par la CTM) ne voient
 * rien. Le défilement est laissé au `overflow: auto` du conteneur.
 */
export const mountZoom = ({ svgRoot, scroller, container }) => {
  /* `null` = ajusté au conteneur (comportement par défaut via `max-width`). */
  let zoom = null;

  const label = document.createElement('output');
  label.className = 'zoom-level';

  const currentZoom = () => zoom ?? svgRoot.getBoundingClientRect().width / STAGE.width;

  const refresh = () => {
    label.textContent = `${Math.round(currentZoom() * 100)} %`;
  };

  /* Garde sous `anchor` (coordonnées écran) le même point de la scène. */
  const setZoom = (next, anchor) => {
    const before = svgRoot.getBoundingClientRect();
    const point = anchor ?? {
      x: before.left + before.width / 2,
      y: before.top + before.height / 2,
    };
    const fx = (point.x - before.left) / before.width;
    const fy = (point.y - before.top) / before.height;

    zoom = next === null ? null : clampZoom(next);
    svgRoot.style.maxWidth = zoom === null ? '' : 'none';
    svgRoot.style.maxHeight = zoom === null ? '' : 'none';
    svgRoot.style.width = zoom === null ? '' : `${STAGE.width * zoom}px`;

    const after = svgRoot.getBoundingClientRect();
    scroller.scrollLeft += after.left + fx * after.width - point.x;
    scroller.scrollTop += after.top + fy * after.height - point.y;
    refresh();
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
    button('−', 'Dézoomer', () => setZoom(currentZoom() / STEP)),
    label,
    button('+', 'Zoomer', () => setZoom(currentZoom() * STEP)),
    button('Ajuster', "Ajuster à l'écran", () => setZoom(null)),
  );
  container.append(group);

  /* Ctrl/⌘ + molette, et le pincement trackpad (émis comme wheel + ctrlKey). */
  scroller.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(currentZoom() * Math.exp(-event.deltaY * 0.01), {
        x: event.clientX,
        y: event.clientY,
      });
    },
    { passive: false },
  );

  window.addEventListener('keydown', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.key === '+' || event.key === '=') setZoom(currentZoom() * STEP);
    else if (event.key === '-') setZoom(currentZoom() / STEP);
    else if (event.key === '0') setZoom(null);
    else return;
    event.preventDefault();
  });

  window.addEventListener('resize', refresh);
  refresh();
};
