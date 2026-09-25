// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { render } from '../src/renderer-svg.js';
import * as scene from '../src/scene.js';
import { createElement, createLayer, setActiveElement, updateElement } from '../src/scene.js';

/* Rendu incrémental : un calque dont la référence n'a pas changé garde ses
   nœuds, un changement de sélection ne refait que la couche d'écran. */

const stage = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const flatLayer = (x) =>
  createLayer({
    elements: [createElement('ellipse', x, 100)],
    modifiers: [{ type: 'step', n: 3, stepX: 40, stepY: 0, angleStep: 0.4, radiusStep: 12 }],
  });
const PLANE = { enabled: true, tilt: 45, heading: 45, sides: 'outline' };
const solidLayer = (x) => createLayer({ plane: PLANE, elements: [createElement('rect', x, 100, { height: 40 })] });
const sceneOf = (...layers) => ({ layers, activeLayerId: layers[0].id, activeElementId: null });
const firstNode = (svg, layer) => svg.querySelector(`[data-layer-id="${layer.id}"] [data-element-id]`);
/* Même dessin au renommage des masques près : les ids suivent un compteur. */
const markup = (svg) => svg.innerHTML.replace(/(id="|url\(#)([a-z-]+)(?:[A-Z]\d+-)?[\d-]+/g, '$1$2');

it('sélection seule : les nœuds du calque restent les mêmes objets DOM', () => {
  const svg = stage();
  const base = sceneOf(flatLayer(100));
  render(base, svg);
  const node = firstNode(svg, base.layers[0]);
  const { id } = base.layers[0].elements[0];
  render(setActiveElement(base, id), svg);
  expect(firstNode(svg, base.layers[0])).toBe(node);
  expect(svg.querySelector('[data-selection]')).not.toBeNull();
  render(setActiveElement(base, null), svg);
  expect(firstNode(svg, base.layers[0])).toBe(node);
});

it('sélection seule : aucun calque recalculé', () => {
  const svg = stage();
  const base = sceneOf(flatLayer(100), flatLayer(300));
  render(base, svg);
  const spy = vi.spyOn(scene, 'getRenderedChildren');
  render(setActiveElement(base, base.layers[1].elements[0].id), svg);
  render(setActiveElement(base, null), svg);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

it('seul le calque changé est reconstruit, une fois', () => {
  const svg = stage();
  const base = sceneOf(flatLayer(100), flatLayer(300));
  render(base, svg);
  const [kept, changed] = base.layers;
  const keptNode = firstNode(svg, kept);
  const changedNode = firstNode(svg, changed);
  const spy = vi.spyOn(scene, 'getRenderedChildren');
  render(updateElement(base, changed.elements[0].id, { x: 320 }), svg);
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
  expect(firstNode(svg, kept)).toBe(keptNode);
  expect(firstNode(svg, changed)).not.toBe(changedNode);
});

it('en 3D, l’occlusion entre calques se refait comme un rendu neuf', () => {
  const svg = stage();
  const base = sceneOf(solidLayer(100), solidLayer(130), solidLayer(160));
  render(base, svg);
  const next = updateElement(base, base.layers[2].elements[0].id, { x: 120 });
  render(next, svg);
  const fresh = stage();
  render(next, fresh);
  expect(markup(svg)).toBe(markup(fresh));
  expect(svg.querySelectorAll('[mask^="url(#occlude"]').length).toBeGreaterThan(0);
  /* Retour en arrière : même dessin que le premier rendu. */
  render(base, svg);
  const first = stage();
  render(base, first);
  expect(markup(svg)).toBe(markup(first));
});
