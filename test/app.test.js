// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { SHAPES } from '../src/scene.js';

/**
 * Fumigation : monte l'application entière sur le DOM que sert `index.html` et
 * vérifie qu'elle se câble sans exception.
 *
 * Les tests unitaires couvrent chaque module isolément ; celui-ci attrape les
 * erreurs de branchement entre eux — un id absent, un import circulaire, un
 * panneau qui plante au premier rendu.
 */
it('démarre, affiche l’aide et rend après un placement', async () => {
  document.body.innerHTML = `
    <div id="toolbar-shapes"></div>
    <div id="toolbar-actions"></div>
    <svg id="stage" viewBox="0 0 900 900"></svg>
    <p class="stage-hint" id="stage-hint">Glisser depuis le centre pour dessiner</p>
    <div id="layer-panel"></div>
    <div id="property-panel"></div>
    <p id="status"></p>`;

  await import('../src/main.js');

  const hint = document.getElementById('stage-hint');
  const stage = document.getElementById('stage');

  expect(hint.hidden).toBe(false);
  expect(stage.childNodes).toHaveLength(0);
  expect(document.querySelectorAll('#layer-panel .layer-row')).toHaveLength(1);
  /* Formes du calque, Forme, Calque, Modificateur, Interpolation. */
  expect(document.querySelectorAll('#property-panel fieldset')).toHaveLength(5);
  expect(document.querySelectorAll('#toolbar-shapes input[type="radio"]')).toHaveLength(
    Object.keys(SHAPES).length,
  );

  globalThis.DOMPoint = class {
    constructor(x, y) {
      Object.assign(this, { x, y });
    }
    matrixTransform() {
      return { x: this.x, y: this.y };
    }
  };
  stage.getScreenCTM = () => ({ inverse: () => ({}) });
  const pointer = (type, x, y) =>
    stage.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0 }));
  pointer('pointerdown', 450, 450);
  pointer('pointermove', 450, 520);
  pointer('pointerup', 450, 520);

  expect(stage.querySelectorAll('circle')).toHaveLength(1);
  expect(stage.querySelector('circle').getAttribute('r')).toBe('70');
  expect(hint.hidden).toBe(true);

  /* Un second geste ajoute une forme au même calque au lieu de remplacer la
     première, et la liste des formes du panneau les montre toutes les deux. */
  pointer('pointerdown', 200, 200);
  pointer('pointerup', 230, 200);

  expect(stage.querySelectorAll('circle')).toHaveLength(2);
  expect(document.querySelectorAll('#property-panel .layer-row')).toHaveLength(2);
});
