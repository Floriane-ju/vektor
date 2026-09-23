import {
  absolutePoints,
  addElement,
  addTraces,
  DEFAULT_SHAPE,
  dragPatch,
  getActiveElement,
  getActiveLayer,
  recenterTrace,
  removeElement,
  rotateVector,
  setActiveElement,
  setActiveLayer,
  SHAPES,
  updateElement,
} from '../scene.js';
import { clearHover, toSvgDocument } from '../renderer-svg.js';
import { deserialize, download, serialize } from '../persistence.js';
import { parseTrace } from '../path.js';
import { icon } from './icons.js';
import { TOOL_KEYS } from './shortcuts.js';

/* Touche de chaque outil, pour l'infobulle. */
const KEY_OF = Object.fromEntries(Object.entries(TOOL_KEYS).map(([key, type]) => [type, key.toUpperCase()]));

/** Outil de sélection : partage le groupe radio des formes, sans en être une. */
const CURSOR = 'cursor';

/** En deçà, le geste est lu comme un clic : la forme prend sa taille par défaut. */
const DRAG_THRESHOLD = 3;

/* Un clic à moins de cette distance du premier sommet ferme le tracé. */
const CLOSE_DISTANCE = 10;

const elementById = (scene, id) =>
  scene.layers.flatMap((layer) => layer.elements).find((element) => element.id === id) ?? null;

/* Entrée du menu Exporter : le menu se referme avant l'action, qui peut ouvrir
   un sélecteur de fichier ou un `prompt`. */
const menuItem = (label, onClick, title) => {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'menu-item';
  node.textContent = label;
  if (title) node.title = title;
  node.addEventListener('click', (event) => {
    node.closest('[popover]')?.hidePopover?.();
    onClick(event);
  });
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

export const mountToolbar = ({ store, svgRoot, container, shapeContainer, status, snap = (point) => point }) => {
  /* Le dessin lit le pointeur aimanté par la grille. Les déplacements lisent
     le pointeur brut et aimantent la position d'arrivée : sur une grille ronde,
     un écart entre deux croisements ne mène pas d'un croisement à un autre. */
  const stagePoint = (event) => snap(toStagePoint(svgRoot, event));

  /* `tool` reste la dernière forme choisie même sous le curseur : « + Ajouter
     une forme » en a toujours besoin. */
  let tool = DEFAULT_SHAPE;
  let selecting = false;
  /* Glissement en cours : le point de départ du geste, et la forme créée à ce
     moment-là, que les mouvements suivants se contentent de redimensionner. */
  let stroke = null;
  /* Tracé en cours : la forme dont chaque clic ajoute un sommet. */
  let trace = null;

  mountShapePicker(shapeContainer ?? container, (type) => {
    finishTrace(false);
    selecting = type === CURSOR;
    if (!selecting) tool = type;
    svgRoot.dataset.tool = selecting ? CURSOR : 'draw';
    clearHover(svgRoot);
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;

  const exportSvg = menuItem('Exporter en SVG', (event) => {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      download(toSvgDocument(svgRoot), 'vektor.svg', 'image/svg+xml');
      status.show('SVG exporté.');
    } finally {
      trigger.disabled = false;
    }
  });

  const exportJson = menuItem('Exporter le projet (JSON)', () => {
    download(serialize(store.get()), 'vektor.json', 'application/json');
    status.show('Projet exporté.');
  });

  const importJson = menuItem('Importer un projet (JSON)…', () => fileInput.click());

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

  /* ponytail: `prompt` natif, comme le renommage des calques — un champ dédié
     le jour où l'on veut prévisualiser avant d'importer. */
  const pasteTrace = menuItem(
    'Coller un tracé…',
    () => {
      const layer = getActiveLayer(store.get());
      if (!layer) {
        status.show('Sélectionner un calque avant de coller un tracé.', 'error');
        return;
      }
      const text = prompt('Chemin SVG à coller (attribut d, points, ou la balise entière)');
      if (text == null) return;
      try {
        const traces = parseTrace(text);
        store.apply(addTraces, layer.id, traces);
        status.show(`${traces.length} tracé${traces.length > 1 ? 's' : ''} ajouté${traces.length > 1 ? 's' : ''}.`);
      } catch (error) {
        status.show(`Tracé refusé — ${error.message}`, 'error');
      }
    },
    'Segments droits seulement : M, L, H, V, Z',
  );

  /* ponytail: `popover` natif — Échap et clic extérieur ferment le menu, pas de
     navigation aux flèches entre les entrées (Tab suffit). */
  const menu = document.createElement('div');
  menu.id = 'export-menu';
  menu.className = 'menu';
  menu.popover = 'auto';
  menu.append(exportSvg, exportJson, importJson, pasteTrace);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pill-btn is-primary';
  trigger.setAttribute('popovertarget', menu.id);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.append('Exporter', icon('chevronDown', 12));

  container.append(trigger, menu, fileInput);

  /* ---- Sélection au curseur ---- */

  /* Toutes les copies d'un modificateur portent l'id de leur forme source :
     survoler ou cliquer n'importe laquelle désigne cette forme. */
  const shapeAt = (event) => event.target.closest?.('[data-element-id]') ?? null;

  const select = (node) => {
    if (!node) {
      store.apply(setActiveElement, null);
      return;
    }
    const { layerId } = node.closest('[data-layer-id]').dataset;
    store.apply(
      (scene) => setActiveElement(setActiveLayer(scene, layerId), node.dataset.elementId),
    );
  };

  /* Déplacement en cours : point de départ du geste et position d'origine de
     la forme. Le geste part de n'importe où dans le dessin — sur une autre
     forme, il la sélectionne d'abord et c'est elle qui bouge. */
  let drag = null;

  /* Glissement d'un sommet de tracé, par sa poignée. */
  let vertexDrag = null;

  const startDrag = (event) => {
    const handle = event.target.closest?.('[data-vertex]');
    const selected = getActiveElement(store.get());
    if (handle && selected?.points) {
      vertexDrag = {
        point: toStagePoint(svgRoot, event),
        element: selected,
        index: Number(handle.dataset.vertex),
      };
      svgRoot.setPointerCapture?.(event.pointerId);
      return;
    }
    const node = shapeAt(event);
    if (node) select(node);
    const element = getActiveElement(store.get());
    if (!element) return;
    const point = toStagePoint(svgRoot, event);
    drag = { point, origin: element, onEmpty: !node, moved: false };
    svgRoot.toggleAttribute('data-dragging', true);
    svgRoot.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    const { x, y } = toStagePoint(svgRoot, event);
    const dx = x - drag.point.x;
    const dy = y - drag.point.y;
    /* Sans seuil, le tremblement d'un clic décalerait la forme d'un pixel. */
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    store.apply(updateElement, drag.origin.id, snap({ x: drag.origin.x + dx, y: drag.origin.y + dy }));
  };

  const endDrag = (event) => {
    moveDrag(event);
    if (drag.onEmpty && !drag.moved) select(null);
    svgRoot.releasePointerCapture?.(event.pointerId);
    svgRoot.toggleAttribute('data-dragging', false);
    drag = null;
  };

  const moveVertex = (event) => {
    const { x, y } = toStagePoint(svgRoot, event);
    const { element, index, point } = vertexDrag;
    /* Le geste est lu à l'écran, le sommet vit dans le repère de la forme :
       on aimante sa position à l'écran, puis on la ramène dans ce repère. */
    const rotation = element.rotation ?? 0;
    const start = rotateVector(element.points[index], rotation);
    const target = snap({ x: element.x + start.x + x - point.x, y: element.y + start.y + y - point.y });
    const local = rotateVector({ x: target.x - element.x, y: target.y - element.y }, -rotation);
    const points = element.points.map((p, i) => (i === index ? local : p));
    store.apply(updateElement, element.id, { points });
  };

  svgRoot.addEventListener('pointermove', (event) => {
    if (!selecting) return;
    if (vertexDrag) {
      moveVertex(event);
      return;
    }
    if (drag) moveDrag(event);
    svgRoot.toggleAttribute('data-has-selection', Boolean(store.get().activeElementId));
  });
  svgRoot.addEventListener('pointerleave', () => clearHover(svgRoot));

  /* ---- Dessin au glisser ---- */

  /* Le `pointerdown` ajoute la forme, les mouvements ne font plus que la
     redimensionner : chaque geste crée une forme de plus sur le calque au lieu
     de remplacer la précédente. */
  const patchAt = (event) => {
    const point = stagePoint(event);
    return dragPatch(tool, stroke, point.x - stroke.x, point.y - stroke.y, event.shiftKey);
  };

  /* ---- Tracé au clic ---- */

  /* Segment fantôme du dernier sommet au curseur : un état d'écran, posé comme
     le survol pour que le rendu suivant et l'export l'effacent d'eux-mêmes. */
  const previewTrace = (event) => {
    const element = elementById(store.get(), trace.elementId);
    if (!element) return;
    const last = absolutePoints(element).at(-1);
    const { x, y } = stagePoint(event);
    clearHover(svgRoot);
    const ghost = document.createElementNS(svgRoot.namespaceURI, 'line');
    for (const [name, value] of Object.entries({ x1: last.x, y1: last.y, x2: x, y2: y })) {
      ghost.setAttribute(name, String(value));
    }
    ghost.dataset.hover = '';
    ghost.setAttribute('stroke', 'currentColor');
    ghost.setAttribute('stroke-dasharray', '4 4');
    ghost.setAttribute('pointer-events', 'none');
    svgRoot.append(ghost);
  };

  /**
   * Chaque clic pose un sommet ; cliquer près du premier ferme le tracé.
   * Double-clic, Entrée, Échap ou changement d'outil le laissent ouvert.
   */
  const traceClick = (layer, x, y) => {
    const element = trace && elementById(store.get(), trace.elementId);
    if (!element) {
      store.apply(addElement, layer.id, 'polyline', x, y, { points: [{ x: 0, y: 0 }], closed: false });
      trace = { elementId: store.get().activeElementId };
      return;
    }
    const [first] = absolutePoints(element);
    if (element.points.length >= 3 && Math.hypot(x - first.x, y - first.y) < CLOSE_DISTANCE) {
      finishTrace(true);
      return;
    }
    store.apply(updateElement, element.id, {
      points: [...element.points, { x: x - element.x, y: y - element.y }],
    });
  };

  /* Les deux clics d'un double-clic posent deux sommets confondus : on les
     fond. Un tracé réduit à un sommet ne dessine rien et disparaît. */
  function finishTrace(closed) {
    if (!trace) return;
    const { elementId } = trace;
    trace = null;
    clearHover(svgRoot);
    const element = elementById(store.get(), elementId);
    if (!element) return;
    const points = element.points.filter(
      (p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) >= DRAG_THRESHOLD,
    );
    if (points.length < 2) {
      store.apply(removeElement, elementId);
      return;
    }
    store.apply((scene) => recenterTrace(updateElement(scene, elementId, { points, closed }), elementId));
  }

  svgRoot.addEventListener('dblclick', () => finishTrace(false));
  window.addEventListener('keydown', (event) => {
    if (trace && (event.key === 'Enter' || event.key === 'Escape')) finishTrace(false);
  });

  svgRoot.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (selecting) {
      startDrag(event);
      return;
    }
    const layer = getActiveLayer(store.get());
    if (!layer) {
      status.show('Sélectionner un calque avant de dessiner.', 'error');
      return;
    }
    const { x, y } = stagePoint(event);
    if (tool === 'polyline') {
      traceClick(layer, x, y);
      return;
    }
    store.apply(addElement, layer.id, tool, x, y, { rx: 0, ry: 0 });
    stroke = { x, y, elementId: store.get().activeElementId };
    /* La capture garde les mouvements même quand le curseur sort du stage :
       sans elle, un glissement large laisserait la forme figée à mi-course. */
    svgRoot.setPointerCapture?.(event.pointerId);
  });

  svgRoot.addEventListener('pointermove', (event) => {
    if (trace) previewTrace(event);
    if (!stroke) return;
    store.apply(updateElement, stroke.elementId, patchAt(event));
  });

  svgRoot.addEventListener('pointerup', (event) => {
    if (vertexDrag) {
      moveVertex(event);
      store.apply(recenterTrace, vertexDrag.element.id);
      svgRoot.releasePointerCapture?.(event.pointerId);
      vertexDrag = null;
    }
    if (drag) endDrag(event);
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
    drag = null;
    vertexDrag = null;
    svgRoot.toggleAttribute('data-dragging', false);
  });

  return { getTool: () => tool };
};
