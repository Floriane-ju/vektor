// @vitest-environment happy-dom
/* Banc T-0107 : spirale lissée en ruban 3D × axial 12. Sauté sans `BENCH=1`
   (`BENCH=1 pnpm test bench/`) ; imprime le temps de `render` et l'empreinte
   du SVG, pour vérifier que le rendu ne change pas. */
import { it } from 'vitest';
import { createHash } from 'node:crypto';
import { render } from '../src/renderer-svg.js';
import { createElement, createLayer } from '../src/scene.js';
import { createModifier } from '../src/modifiers.js';

it.skipIf(!process.env.BENCH)('banc : ruban de spirale lissée × axial 12', { timeout: 60000 }, () => {
  const spiral = createModifier({ type: 'spiral', n: 16, angleStep: 0.6, radiusStep: 8, linear: true, smooth: true });
  const point = createElement('point', 520, 450, { strokeWidth: 6, height: 60, outlined: true, gap: 14, modifiers: [spiral] });
  const layer = createLayer({
    center: { x: 450, y: 450 },
    modifiers: [createModifier({ type: 'axial', n: 12 })],
    plane: { tilt: 55, heading: 20, sides: 'transparent' },
    elements: [point],
  });
  const scene = { layers: [layer], activeLayerId: null, activeElementId: null };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  render(scene, svg);
  const runs = 3;
  const start = performance.now();
  for (let i = 0; i < runs; i++) render(scene, svg);
  const ms = (performance.now() - start) / runs;
  const hash = createHash('sha1').update(svg.innerHTML).digest('hex').slice(0, 12);
  console.log(`render ${ms.toFixed(0)} ms — svg ${hash} (${svg.innerHTML.length} car.)`);
});
