import {
  absolutePoints,
  addElement,
  dragPatch,
  getActiveElement,
  getActiveLayer,
  isLockedElement,
  pivotOf,
  recenterTrace,
  removeElement,
  rotateVector,
  scaledPatch,
  selectedIds,
  selectElements,
  setLayerCenter,
  SHAPES,
  toggleSelected,
  translateElements,
  updateElement,
  updateModifier,
} from '../scene.js';
import { axisDirection, MIRROR_AXIS } from '../modifiers.js';
import { CHROME, clearHover, elementsInBox, svgNode } from '../renderer-svg.js';
import { boundsOf } from '../math.js';

/**
 * Gestes au pointeur sur le plan de travail. Chaque geste commencé est un
 * objet `{ move(event), end(event), cancel() }` : la toolbar n'en tient qu'un
 * à la fois. `ctx` = `{ store, svgRoot, snap, planePoint, stagePoint, screenPoint }`
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

/* Rapport de mise à l'échelle le long d'un axe ; départ trop près du centre
   (poignée de côté d'une forme très tournée) : l'axe ne bouge pas. */
const ratio = (now, from) => (Math.abs(from) < 1 ? 1 : Math.max(0, now / from));

/* Pas de la rotation aimantée (Maj), en degrés. */
const ROTATE_STEP = 15;

/**
 * Poignée du cadre de sélection : un côté étire la forme le long de son axe,
 * un coin la met à l'échelle sans la déformer, autour de son centre ; le
 * bouton du haut la tourne (Maj : par pas de 15°). Côtés et coins s'aimantent
 * à la grille. Tout se lit dans le repère
 * de la forme, depuis la forme d'origine : un pas d'historique par geste.
 */
const transformGesture = (ctx, event, knob, origin) => {
  const { store, snap, planePoint } = ctx;
  const center = { x: origin.x, y: origin.y };
  const rotation = origin.rotation ?? 0;
  const local = (point) => rotateVector({ x: point.x - center.x, y: point.y - center.y }, -rotation);
  const side = knob.dataset.resize ?? '';
  /* Redimensionner lit le pointeur aimanté, départ compris : la poignée, près
     du bord, part du croisement de ce bord ; le rapport des deux croisements
     garde sur la grille une forme qui y était posée. Départ aimanté au centre
     (forme plus petite qu'une demi-maille) : on reprend le pointeur brut sur
     cet axe, sinon l'axe ne bougerait plus. */
  const read = (e) => local(side ? snap(planePoint(e)) : planePoint(e));
  const raw = local(planePoint(event));
  const snapped = read(event);
  const from = {
    x: Math.abs(snapped.x) < 1 ? raw.x : snapped.x,
    y: Math.abs(snapped.y) < 1 ? raw.y : snapped.y,
  };
  const move = (next) => {
    const now = read(next);
    if (!side) {
      const turn = ((Math.atan2(now.y, now.x) - Math.atan2(from.y, from.x)) * 180) / Math.PI;
      const angle = rotation + turn;
      const snapped = next.shiftKey ? Math.round(angle / ROTATE_STEP) * ROTATE_STEP : angle;
      store.apply(updateElement, origin.id, { rotation: Math.round(snapped * 10) / 10 % 360 });
      return;
    }
    const corner = side.length === 2;
    const uniform = Math.hypot(now.x, now.y) / (Math.hypot(from.x, from.y) || 1);
    const fx = corner ? uniform : /[ew]/.test(side) ? ratio(now.x, from.x) : 1;
    const fy = corner ? uniform : /[ns]/.test(side) ? ratio(now.y, from.y) : 1;
    store.apply(updateElement, origin.id, scaledPatch(origin, fx, fy));
  };
  capture(ctx, event, true);
  return {
    move,
    end: (next) => {
      move(next);
      if (origin.points) store.apply(recenterTrace, origin.id);
      release(ctx, next);
    },
    cancel: () => {},
  };
};

/* Déplacement de la sélection, depuis une de ses formes. Hors sélection, la
   forme est d'abord sélectionnée seule ; déjà sélectionnée, tout le groupe
   bouge avec elle, et un clic sans glisser la sélectionne seule. */
const moveGesture = (ctx, event, id) => {
  const { store, snap, planePoint } = ctx;
  const grouped = selectedIds(store.get()).includes(id);
  /* La forme saisie devient l'active : c'est elle que montre le panneau. */
  const others = grouped ? selectedIds(store.get()).filter((other) => other !== id) : [];
  store.apply(selectElements, [...others, id]);
  const ids = selectedIds(store.get());
  const origin = elementById(store.get(), id);
  if (!origin) return null;
  const start = planePoint(event);
  let moved = false;
  /* Écart déjà appliqué : chaque pas ne déplace que la différence. */
  let applied = { x: 0, y: 0 };
  const move = (next) => {
    const { x, y } = planePoint(next);
    const dx = x - start.x;
    const dy = y - start.y;
    /* Sans seuil, le tremblement d'un clic décalerait la forme d'un pixel. */
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    /* La forme saisie s'aimante, le groupe suit du même écart. */
    const target = snap({ x: origin.x + dx, y: origin.y + dy });
    const total = { x: target.x - origin.x, y: target.y - origin.y };
    store.apply(translateElements, ids, total.x - applied.x, total.y - applied.y);
    applied = total;
  };
  capture(ctx, event, true);
  return {
    move,
    end: (next) => {
      move(next);
      if (grouped && !moved) store.apply(selectElements, [id]);
      release(ctx, next);
    },
    cancel: () => {},
  };
};

/* Rectangle du lasso : état d'écran posé comme le survol, que le rendu
   suivant et l'export effacent d'eux-mêmes. */
const lassoFrame = (svgRoot, box) => {
  clearHover(svgRoot);
  const node = svgNode('rect', {
    x: box.minX,
    y: box.minY,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-dasharray': CHROME.sketchDash,
    'vector-effect': 'non-scaling-stroke',
    'pointer-events': 'none',
  });
  node.dataset.hover = '';
  svgRoot.append(node);
};

/* Lasso, depuis le vide : sélectionne les formes du calque actif qu'il touche,
   en plus de la sélection avec Maj. Un clic sans glisser relâche la sélection. */
const lassoGesture = (ctx, event) => {
  const { store, svgRoot, screenPoint } = ctx;
  const start = screenPoint(event);
  const base = event.shiftKey ? selectedIds(store.get()) : [];
  let moved = false;
  const move = (next) => {
    const point = screenPoint(next);
    if (!moved && Math.hypot(point.x - start.x, point.y - start.y) < DRAG_THRESHOLD) return;
    moved = true;
    const box = boundsOf([start, point]);
    const layer = getActiveLayer(store.get());
    const hits = layer?.locked ? [] : elementsInBox(svgRoot, layer, box);
    store.apply(selectElements, [...base, ...hits.filter((id) => !base.includes(id))]);
    lassoFrame(svgRoot, box);
  };
  capture(ctx, event);
  return {
    move,
    end: (next) => {
      move(next);
      if (!moved && !next.shiftKey) store.apply(selectElements, []);
      clearHover(svgRoot);
      release(ctx, next);
    },
    cancel: () => clearHover(svgRoot),
  };
};

/**
 * Geste du curseur : un pivot, un sommet, la forme sous le pointeur ou dont
 * le cadre de sélection le contient (Maj :
 * l'ajoute ou la retire de la sélection), sinon un lasso.
 */
export const selectGesture = (ctx, event) => {
  const scene = ctx.store.get();
  /* Calque verrouillé : ni pivot, ni sommet, ni forme ne se saisissent. */
  if (!getActiveLayer(scene)?.locked) {
    const knob = event.target.closest?.('[data-resize], [data-rotate]');
    const active = getActiveElement(scene);
    if (knob && active) return transformGesture(ctx, event, knob, active);
    const grip = event.target.closest?.('[data-pivot]');
    const pivot = grip && pivotGesture(ctx, event, grip);
    if (pivot) return pivot;
    const handle = event.target.closest?.('[data-vertex]');
    const selected = getActiveElement(scene);
    if (handle && selected?.points) return vertexGesture(ctx, event, handle, selected);
  }
  /* Toutes les copies d'un modificateur portent l'id de leur forme source :
     cliquer n'importe laquelle désigne cette forme. */
  /* Le cadre d'une forme sélectionnée la saisit dans toute sa surface. */
  const id = event.target.closest?.('[data-element-id]')?.dataset.elementId
    ?? event.target.closest?.('[data-grab]')?.dataset.grab;
  if (!id) return lassoGesture(ctx, event);
  if (isLockedElement(scene, id)) return null;
  if (!event.shiftKey) return moveGesture(ctx, event, id);
  ctx.store.apply(toggleSelected, id);
  return null;
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
  const ghost = svgNode('line', {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    stroke: 'currentColor',
    'stroke-dasharray': CHROME.sketchDash,
    'pointer-events': 'none',
  });
  ghost.dataset.hover = '';
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
