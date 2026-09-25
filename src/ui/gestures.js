import {
  absolutePoints,
  addElement,
  dragPatch,
  getActiveElement,
  getActiveLayer,
  pivotOf,
  recenterTrace,
  removeElement,
  rotateVector,
  setLayerCenter,
  SHAPES,
  updateElement,
  updateModifier,
} from '../scene.js';
import { axisDirection, MIRROR_AXIS } from '../modifiers.js';
import { clearHover } from '../renderer-svg.js';

/**
 * Gestes au pointeur sur le plan de travail. Chaque geste commencé est un
 * objet `{ move(event), end(event), cancel() }` : la toolbar n'en tient qu'un
 * à la fois. `ctx` = `{ store, svgRoot, snap, planePoint, stagePoint, select }`
 * (voir `mountToolbar`).
 */

/** En deçà, le geste est lu comme un clic : la forme prend sa taille par défaut. */
const DRAG_THRESHOLD = 3;

/* Un clic à moins de cette distance du premier sommet ferme le tracé. */
const CLOSE_DISTANCE = 10;

const elementById = (scene, id) =>
  scene.layers.flatMap((layer) => layer.elements).find((element) => element.id === id) ?? null;

/* La capture garde les mouvements même quand le curseur sort du stage :
   sans elle, un glissement large laisserait la forme figée à mi-course. */
const capture = ({ svgRoot }, event, dragging = false) => {
  if (dragging) svgRoot.toggleAttribute('data-dragging', true);
  svgRoot.setPointerCapture?.(event.pointerId);
};
const release = ({ svgRoot }, event) => {
  svgRoot.releasePointerCapture?.(event.pointerId);
  svgRoot.toggleAttribute('data-dragging', false);
};

/* Un miroir ne lit de son pivot que la distance à l'axe : il ne bouge que
   perpendiculairement à lui, sinon traîner l'axe décalerait en douce le
   centre d'un étage voisin. */
const axisNormal = (modifier) => {
  if (!Object.hasOwn(MIRROR_AXIS, modifier.type)) return null;
  const { x, y } = axisDirection(modifier);
  return { x: -y, y: x };
};

/* Glissement d'un pivot, par son repère. Sans pivot propre, l'étage montre
   celui du calque : c'est lui qui bouge, avec tous les étages qui le partagent. */
const pivotGesture = (ctx, event, grip) => {
  const { store, snap, planePoint } = ctx;
  const layer = getActiveLayer(store.get());
  const index = Number(grip.dataset.pivot);
  /* Étage de la pile d'une forme (`data-pivot-owner`), sinon du calque. */
  const owner = grip.dataset.pivotOwner
    ? layer?.elements.find((element) => element.id === grip.dataset.pivotOwner)
    : layer;
  const modifier = owner?.modifiers[index];
  if (!modifier) return null;
  const origin = pivotOf(layer, index, owner);
  const start = planePoint(event);
  const offset = { x: origin.x - start.x, y: origin.y - start.y };
  const normal = axisNormal(modifier);
  const move = (next) => {
    const point = planePoint(next);
    const free = snap({ x: point.x + offset.x, y: point.y + offset.y });
    const along = normal && (free.x - origin.x) * normal.x + (free.y - origin.y) * normal.y;
    const target = normal ? { x: origin.x + along * normal.x, y: origin.y + along * normal.y } : { ...free };
    if (modifier.center) store.apply(updateModifier, owner.id, index, { center: target });
    else store.apply(setLayerCenter, layer.id, target);
  };
  capture(ctx, event, true);
  return {
    move,
    end: (next) => {
      move(next);
      release(ctx, next);
    },
    cancel: () => {},
  };
};

/* Glissement d'un sommet de tracé, par sa poignée. */
const vertexGesture = (ctx, event, handle, element) => {
  const { store, snap, planePoint, svgRoot } = ctx;
  const start = planePoint(event);
  const index = Number(handle.dataset.vertex);
  const move = (next) => {
    const { x, y } = planePoint(next);
    /* Le geste est lu à l'écran, le sommet vit dans le repère de la forme :
       on aimante sa position à l'écran, puis on la ramène dans ce repère. */
    const rotation = element.rotation ?? 0;
    const from = rotateVector(element.points[index], rotation);
    const target = snap({ x: element.x + from.x + x - start.x, y: element.y + from.y + y - start.y });
    const local = rotateVector({ x: target.x - element.x, y: target.y - element.y }, -rotation);
    store.apply(updateElement, element.id, { points: element.points.map((p, i) => (i === index ? local : p)) });
  };
  capture(ctx, event);
  return {
    move,
    end: (next) => {
      move(next);
      store.apply(recenterTrace, element.id);
      svgRoot.releasePointerCapture?.(next.pointerId);
    },
    cancel: () => {},
  };
};

/* Déplacement de la forme active. Le geste part de n'importe où dans le
   dessin — sur une autre forme, il la sélectionne d'abord et c'est elle qui
   bouge ; un clic dans le vide relâche la sélection. */
const moveGesture = (ctx, event, node) => {
  const { store, snap, planePoint, select } = ctx;
  if (node) select(node);
  const origin = getActiveElement(store.get());
  if (!origin) return null;
  const start = planePoint(event);
  let moved = false;
  const move = (next) => {
    const { x, y } = planePoint(next);
    const dx = x - start.x;
    const dy = y - start.y;
    /* Sans seuil, le tremblement d'un clic décalerait la forme d'un pixel. */
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    store.apply(updateElement, origin.id, snap({ x: origin.x + dx, y: origin.y + dy }));
  };
  capture(ctx, event, true);
  return {
    move,
    end: (next) => {
      move(next);
      if (!node && !moved) select(null);
      release(ctx, next);
    },
    cancel: () => {},
  };
};

/** Geste du curseur : un pivot, un sommet, sinon la forme sous le pointeur. */
export const selectGesture = (ctx, event) => {
  const grip = event.target.closest?.('[data-pivot]');
  const pivot = grip && pivotGesture(ctx, event, grip);
  if (pivot) return pivot;
  const handle = event.target.closest?.('[data-vertex]');
  const selected = getActiveElement(ctx.store.get());
  if (handle && selected?.points) return vertexGesture(ctx, event, handle, selected);
  /* Toutes les copies d'un modificateur portent l'id de leur forme source :
     cliquer n'importe laquelle désigne cette forme. */
  return moveGesture(ctx, event, event.target.closest?.('[data-element-id]') ?? null);
};

/* Sur un calque en 3D, la forme naît sur le plan incliné mais sans
   profondeur : son volume n'apparaît qu'au relâchement (`depth` = celle que
   `addElement` lui a donnée, rendue à la fin du geste). */
const addFlat = (store, layerId, type, x, y, options) => {
  store.apply(addElement, layerId, type, x, y, options);
  const element = getActiveElement(store.get());
  const depth = element.height ?? 0;
  if (depth > 0) store.apply(updateElement, element.id, { height: 0 });
  return { elementId: element.id, depth };
};
const restoreDepth = (depth) => (depth > 0 ? { height: depth } : {});

/**
 * Dessin au glisser : le `pointerdown` ajoute la forme, les mouvements ne font
 * plus que la redimensionner — chaque geste crée une forme de plus sur le
 * calque au lieu de remplacer la précédente.
 */
export const drawGesture = (ctx, event, layer, tool) => {
  const { store, stagePoint } = ctx;
  const { x, y } = stagePoint(event);
  const { elementId, depth } = addFlat(store, layer.id, tool, x, y, { rx: 0, ry: 0 });
  const patchAt = (next) => {
    const point = stagePoint(next);
    return dragPatch(tool, { x, y }, point.x - x, point.y - y, next.shiftKey);
  };
  capture(ctx, event);
  return {
    move: (next) => store.apply(updateElement, elementId, patchAt(next)),
    end: (next) => {
      const patch = patchAt(next);
      /* Les extensions d'une forme orientée sont signées : c'est leur distance
         à zéro qui dit si le geste a bougé, pas leur valeur. */
      const isClick = Math.abs(patch.rx) < DRAG_THRESHOLD && Math.abs(patch.ry) < DRAG_THRESHOLD;
      const { rx, ry } = isClick ? SHAPES[tool].defaults : patch;
      store.apply(updateElement, elementId, { ...patch, rx, ry, ...restoreDepth(depth) });
      ctx.svgRoot.releasePointerCapture?.(next.pointerId);
    },
    /* Geste interrompu (touche Échap, pointeur perdu) : la forme reste à sa
       dernière taille plutôt que de disparaître — l'utilisateur la reprend par
       les champs du panneau ou la supprime. */
    cancel: () => {
      if (depth > 0) store.apply(updateElement, elementId, restoreDepth(depth));
    },
  };
};

/* Segment fantôme du dernier sommet au curseur : un état d'écran, posé comme
   le survol pour que le rendu suivant et l'export l'effacent d'eux-mêmes. */
const ghostSegment = (svgRoot, from, to) => {
  clearHover(svgRoot);
  const ghost = document.createElementNS(svgRoot.namespaceURI, 'line');
  for (const [name, value] of Object.entries({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })) {
    ghost.setAttribute(name, String(value));
  }
  ghost.dataset.hover = '';
  ghost.setAttribute('stroke', 'currentColor');
  ghost.setAttribute('stroke-dasharray', '4 4');
  ghost.setAttribute('pointer-events', 'none');
  svgRoot.append(ghost);
};

/**
 * Tracé au clic : chaque clic pose un sommet ; cliquer près du premier ferme
 * le tracé. Double-clic, Entrée, Échap ou changement d'outil le laissent ouvert.
 */
export const createTracer = ({ store, svgRoot, stagePoint }) => {
  /* La forme dont chaque clic ajoute un sommet. */
  let trace = null;

  /* Les deux clics d'un double-clic posent deux sommets confondus : on les
     fond. Un tracé réduit à un sommet ne dessine rien et disparaît. */
  const finish = (closed) => {
    if (!trace) return;
    const { elementId, depth } = trace;
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
    store.apply((scene) => recenterTrace(updateElement(scene, elementId, { points, closed, ...restoreDepth(depth) }), elementId));
  };

  const click = (layer, event) => {
    const { x, y } = stagePoint(event);
    const element = trace && elementById(store.get(), trace.elementId);
    if (!element) {
      trace = addFlat(store, layer.id, 'polyline', x, y, { points: [{ x: 0, y: 0 }], closed: false });
      return;
    }
    const [first] = absolutePoints(element);
    if (element.points.length >= 3 && Math.hypot(x - first.x, y - first.y) < CLOSE_DISTANCE) {
      finish(true);
      return;
    }
    store.apply(updateElement, element.id, {
      points: [...element.points, { x: x - element.x, y: y - element.y }],
    });
  };

  const preview = (event) => {
    const element = trace && elementById(store.get(), trace.elementId);
    if (element) ghostSegment(svgRoot, absolutePoints(element).at(-1), stagePoint(event));
  };

  return { click, preview, finish, active: () => trace !== null };
};
