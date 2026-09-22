import {
  addElement,
  DEFAULT_SHAPE,
  dragPatch,
  getActiveLayer,
  SHAPES,
  updateElement,
} from '../scene.js';
import { toSvgDocument } from '../renderer-svg.js';
import { deserialize, download, serialize } from '../persistence.js';

/** En deçà, le geste est lu comme un clic : la forme prend sa taille par défaut. */
const DRAG_THRESHOLD = 3;

const button = (label, onClick, title) => {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  if (title) node.title = title;
  node.addEventListener('click', onClick);
  return node;
};

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
  legend.textContent = 'Forme';
  group.append(legend);

  for (const [type, shape] of Object.entries(SHAPES)) {
    const id = `shape-${type}`;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'shape';
    radio.id = id;
    radio.value = type;
    radio.checked = type === DEFAULT_SHAPE;
    radio.addEventListener('change', () => radio.checked && onChange(type));

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = shape.label;

    group.append(radio, label);
  }

  container.append(group);
};

export const mountToolbar = ({ store, svgRoot, container, shapeContainer, status }) => {
  let tool = DEFAULT_SHAPE;
  /* Glissement en cours : le point de départ du geste, et la forme créée à ce
     moment-là, que les mouvements suivants se contentent de redimensionner. */
  let stroke = null;

  mountShapePicker(shapeContainer ?? container, (type) => {
    tool = type;
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;

  const exportSvg = button('Export SVG', (event) => {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      download(toSvgDocument(svgRoot), 'illu.svg', 'image/svg+xml');
      status.show('SVG exporté.');
    } finally {
      trigger.disabled = false;
    }
  });

  const exportJson = button('Exporter JSON', () => {
    download(serialize(store.get()), 'illu.json', 'application/json');
    status.show('Projet exporté.');
  });

  const importJson = button('Importer JSON', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      store.set(deserialize(await file.text()));
      status.show(`« ${file.name} » importé.`);
    } catch (error) {
      status.show(`Import refusé — ${error.message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  container.append(exportSvg, exportJson, importJson, fileInput);

  /* ---- Dessin au glisser ---- */

  /* Le `pointerdown` ajoute la forme, les mouvements ne font plus que la
     redimensionner : chaque geste crée une forme de plus sur le calque au lieu
     de remplacer la précédente. */
  const patchAt = (event) => {
    const point = toStagePoint(svgRoot, event);
    return dragPatch(tool, stroke, point.x - stroke.x, point.y - stroke.y);
  };

  svgRoot.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const layer = getActiveLayer(store.get());
    if (!layer) {
      status.show('Sélectionner un calque avant de dessiner.', 'error');
      return;
    }
    const { x, y } = toStagePoint(svgRoot, event);
    store.apply(addElement, layer.id, tool, x, y, { rx: 0, ry: 0 });
    stroke = { x, y, elementId: store.get().activeElementId };
    /* La capture garde les mouvements même quand le curseur sort du stage :
       sans elle, un glissement large laisserait la forme figée à mi-course. */
    svgRoot.setPointerCapture?.(event.pointerId);
  });

  svgRoot.addEventListener('pointermove', (event) => {
    if (!stroke) return;
    store.apply(updateElement, stroke.elementId, patchAt(event));
  });

  svgRoot.addEventListener('pointerup', (event) => {
    if (!stroke) return;
    const patch = patchAt(event);
    /* Les extensions d'une forme orientée sont signées : c'est leur distance à
       zéro qui dit si le geste a bougé, pas leur valeur. */
    const isClick =
      Math.abs(patch.rx) < DRAG_THRESHOLD && Math.abs(patch.ry) < DRAG_THRESHOLD;
    const { rx, ry } = isClick ? SHAPES[tool].defaults : patch;
    store.apply(updateElement, stroke.elementId, { ...patch, rx, ry });
    svgRoot.releasePointerCapture?.(event.pointerId);
    stroke = null;
  });

  /* Geste interrompu (touche Échap, pointeur perdu) : la forme reste à sa
     dernière taille plutôt que de disparaître — l'utilisateur la reprend par
     les champs du panneau ou la supprime. */
  svgRoot.addEventListener('pointercancel', () => {
    stroke = null;
  });

  return { getTool: () => tool };
};
