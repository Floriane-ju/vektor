import {
  activePlane,
  addLayer,
  DEFAULT_SHAPE,
  getActiveLayer,
  SHAPES,
  toggleVisibility,
} from '../scene.js';
import { clearHover } from '../renderer-svg.js';
import { planeMatrix, unproject } from '../plane.js';
import { icon } from './icons.js';
import { TOOL_KEYS } from './shortcuts.js';
import { mountExportMenu } from './export-menu.js';
import { createTracer, drawGesture, selectGesture } from './gestures.js';

/* Touche de chaque outil, pour l'infobulle. */
const KEY_OF = Object.fromEntries(Object.entries(TOOL_KEYS).map(([key, type]) => [type, key.toUpperCase()]));

/** Outil de sélection : partage le groupe radio des formes, sans en être une. */
const CURSOR = 'cursor';

/**
 * Convertit un point écran en coordonnées du système du `<svg>`.
 *
 * Passe par la CTM plutôt que par un ratio sur `getBoundingClientRect` : le
 * stage peut être réduit par `max-width`, et la CTM tient compte de cette mise
 * à l'échelle comme du `viewBox`.
 */
const toStagePoint = (svgRoot, event) => {
  const point = new DOMPoint(event.clientX, event.clientY);
  return point.matrixTransform(svgRoot.getScreenCTM().inverse());
};

/**
 * Sélecteur de forme.
 *
 * Des `<input type="radio">` natifs plutôt qu'un groupe ARIA fait main : le
 * navigateur fournit déjà la navigation aux flèches, l'exclusivité et
 * l'annonce du groupe. Le CSS leur donne l'aspect de boutons segmentés.
 */
const mountShapePicker = (container, onChange) => {
  const group = document.createElement('fieldset');
  group.className = 'shape-picker';
  const legend = document.createElement('legend');
  legend.textContent = 'Outil';
  group.append(legend);

  const tools = [[CURSOR, { label: 'Curseur' }], ...Object.entries(SHAPES)];
  for (const [type, shape] of tools) {
    const id = `shape-${type}`;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'shape';
    radio.id = id;
    radio.value = type;
    radio.checked = type === DEFAULT_SHAPE;
    radio.addEventListener('change', () => radio.checked && onChange(type));

    /* Pastille à icône : le nom reste dans le libellé, masqué à l'écran mais lu
       par les lecteurs d'écran. */
    const label = document.createElement('label');
    label.htmlFor = id;
    label.title = KEY_OF[type] ? `${shape.label} (${KEY_OF[type]})` : shape.label;
    const text = document.createElement('span');
    text.className = 'visually-hidden';
    text.textContent = shape.label;
    label.append(icon(type), text);

    group.append(radio, label);
  }

  container.append(group);
};

/**
 * Contexte des gestes. Le dessin lit le pointeur aimanté par la grille. Les
 * déplacements lisent le pointeur brut et aimantent la position d'arrivée :
 * sur une grille ronde, un écart entre deux croisements ne mène pas d'un
 * croisement à un autre. Sur un calque en plan 3D, le pointeur est ramené dans
 * le repère du plan : dessin, déplacement, sommets et pivots y vivent,
 * l'aimantation aussi — la grille affichée est projetée de même (`gridImage`).
 */
const gestureContext = (store, svgRoot, snap) => {
  const planePoint = (event) => {
    const point = toStagePoint(svgRoot, event);
    const plane = activePlane(getActiveLayer(store.get()));
    return plane ? unproject(planeMatrix(plane), point) : point;
  };
  return {
    store,
    svgRoot,
    snap,
    planePoint,
    stagePoint: (event) => snap(planePoint(event)),
    /* Repère de l'écran, hors plan 3D : celui du lasso et des cadres. */
    screenPoint: (event) => toStagePoint(svgRoot, event),
  };
};

/* Calque où poser un nouveau dessin. Sans calque, le premier geste en crée un :
   même pas d'historique que la forme (pointerdown→pointerup), un seul ⌘Z
   annule les deux. Calque masqué : on le réaffiche, sinon la forme naîtrait
   invisible. */
const drawingLayer = (store) => {
  if (!getActiveLayer(store.get())) store.apply(addLayer);
  if (!getActiveLayer(store.get()).visible) store.apply(toggleVisibility, store.get().activeLayerId);
  return getActiveLayer(store.get());
};

export const mountToolbar = ({ store, svgRoot, container, shapeContainer, status, snap = (point) => point }) => {
  const ctx = gestureContext(store, svgRoot, snap);
  const tracer = createTracer(ctx);

  /* `tool` reste la dernière forme choisie même sous le curseur : « + Ajouter
     une forme » en a toujours besoin. */
  let tool = DEFAULT_SHAPE;
  let selecting = false;
  /* Geste en cours (voir `gestures.js`), un seul à la fois. */
  let gesture = null;

  mountShapePicker(shapeContainer ?? container, (type) => {
    tracer.finish(false);
    selecting = type === CURSOR;
    if (!selecting) tool = type;
    svgRoot.dataset.tool = selecting ? CURSOR : 'draw';
    clearHover(svgRoot);
  });
  mountExportMenu({ store, svgRoot, container, status });

  svgRoot.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (selecting) {
      gesture = selectGesture(ctx, event);
      return;
    }
    const layer = drawingLayer(store);
    if (tool === 'polyline') tracer.click(layer, event);
    else gesture = drawGesture(ctx, event, layer, tool);
  });

  svgRoot.addEventListener('pointermove', (event) => {
    if (tracer.active()) tracer.preview(event);
    gesture?.move(event);
  });

  svgRoot.addEventListener('pointerup', (event) => {
    gesture?.end(event);
    gesture = null;
  });

  svgRoot.addEventListener('pointercancel', () => {
    gesture?.cancel();
    gesture = null;
    svgRoot.toggleAttribute('data-dragging', false);
  });

  svgRoot.addEventListener('pointerleave', () => clearHover(svgRoot));
  svgRoot.addEventListener('dblclick', () => tracer.finish(false));
  window.addEventListener('keydown', (event) => {
    if (tracer.active() && (event.key === 'Enter' || event.key === 'Escape')) tracer.finish(false);
  });

  return { getTool: () => tool };
};
