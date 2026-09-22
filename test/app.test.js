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
    <div id="shape-list"></div>
    <p id="status"></p>`;

  await import('../src/main.js');

  const hint = document.getElementById('stage-hint');
  const stage = document.getElementById('stage');

  expect(hint.hidden).toBe(false);
  expect(stage.childNodes).toHaveLength(0);
  expect(document.querySelectorAll('#layer-panel .layer-row')).toHaveLength(1);
  /* La card du calque actif s'ouvre sur Calque, Modificateurs, Interpolations ;
     sans forme sélectionnée, aucune card de forme n'est ouverte. */
  expect(document.querySelectorAll('#layer-panel fieldset')).toHaveLength(3);
  expect(document.querySelectorAll('#shape-list fieldset')).toHaveLength(0);
  expect(document.querySelectorAll('#toolbar-shapes input[type="radio"]')).toHaveLength(
    Object.keys(SHAPES).length + 1,
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

  expect(stage.querySelectorAll('circle[data-element-id]')).toHaveLength(1);
  expect(stage.querySelector('circle').getAttribute('r')).toBe('70');
  expect(hint.hidden).toBe(true);

  /* Un second geste ajoute une forme au même calque au lieu de remplacer la
     première, et la liste des formes du panneau droit les montre toutes les deux. */
  pointer('pointerdown', 200, 200);
  pointer('pointerup', 230, 200);

  expect(stage.querySelectorAll('circle[data-element-id]')).toHaveLength(2);
  expect(document.querySelectorAll('#shape-list .layer-row')).toHaveLength(2);

  /* Deux modificateurs empilés sur le calque : leurs copies se multiplient. */
  const addModifier = [...document.querySelectorAll('#layer-panel button')].find(
    (node) => node.textContent.includes('Ajouter un modificateur'),
  );
  addModifier.click();
  addModifier.click();

  const blocks = document.querySelectorAll('#layer-panel .modifier-block');
  expect(blocks).toHaveLength(2);
  /* Deux « Pas » de 6 copies sur un calque de deux formes. */
  expect(stage.querySelectorAll('circle[data-element-id]')).toHaveLength(6 * 6 * 2);

  const [type] = blocks[1].querySelectorAll('select');
  type.value = 'mirrorH';
  type.dispatchEvent(new Event('change'));
  expect(stage.querySelectorAll('circle[data-element-id]')).toHaveLength(6 * 2 * 2);

  blocks[0].querySelector('.icon-btn.is-danger').click();
  expect(document.querySelectorAll('#layer-panel .modifier-block')).toHaveLength(1);
  expect(stage.querySelectorAll('circle[data-element-id]')).toHaveLength(2 * 2);

  /* Une interpolation ajoutée depuis la card du calque éteint ses copies. */
  const opacities = () =>
    [...stage.querySelectorAll('circle[data-element-id]')].map((node) => node.getAttribute('fill-opacity'));
  expect(opacities()).toEqual(['1', '1', '1', '1']);

  document.querySelector('[data-focus-key="add-interpolation"]').click();
  expect(document.querySelectorAll('#layer-panel .interpolation-block')).toHaveLength(1);
  expect(opacities()).toEqual(['1', '1', '0', '0']);
});
