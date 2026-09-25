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
it('démarre et rend après un placement', async () => {
  document.body.innerHTML = `
    <div id="toolbar-shapes"></div>
    <div id="toolbar-actions"></div>
    <div id="stroke-card"></div>
    <div id="view-controls"></div>
    <div id="inspector"></div>
    <svg id="stage" viewBox="0 0 900 900"></svg>
    <div id="layer-panel"></div>
    <div id="shape-list"></div>
    <p id="status"></p>`;

  await import('../src/main.js');

  const stage = document.getElementById('stage');

  expect(stage.childNodes).toHaveLength(0);
  expect(document.querySelectorAll('#layer-panel .layer-row')).toHaveLength(1);
  /* Sans forme sélectionnée, le panneau de droite ne montre que le calque. */
  const inspector = document.getElementById('inspector');
  const shown = () => [...inspector.children].filter((node) => !node.hidden).map((node) => node.dataset.kind);
  expect(shown()).toEqual(['layer']);
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
    stage.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
  pointer('pointerdown', 450, 450);
  pointer('pointermove', 450, 520);
  pointer('pointerup', 450, 520);

  expect(stage.querySelectorAll('ellipse[data-element-id]')).toHaveLength(1);
  expect(stage.querySelector('ellipse').getAttribute('ry')).toBe('70');

  /* Un second geste ajoute une forme au même calque au lieu de remplacer la
     première, et la liste des formes du panneau droit les montre toutes les deux. */
  pointer('pointerdown', 200, 200);
  pointer('pointerup', 230, 200);

  expect(stage.querySelectorAll('ellipse[data-element-id]')).toHaveLength(2);
  expect(document.querySelectorAll('#shape-list .layer-row')).toHaveLength(2);
  /* La forme dessinée est sélectionnée : le panneau passe à ses réglages, et
     l'arbre loge la liste des formes sous le calque. */
  expect(shown()).toEqual(['shape']);
  expect(document.querySelector('#layer-panel #shape-list')).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(shown()).toEqual(['layer']);
  /* La liste se lit du premier plan vers le fond : la première ligne est la
     dernière forme dessinée. */
  document.querySelector('#shape-list .layer-name').click();
  expect(shown()).toEqual(['shape']);

  /* Deux modificateurs empilés sur le calque : leurs copies se multiplient. */
  const addModifier = document.querySelector('[data-focus-key="add-modifier"]');
  addModifier.click();
  addModifier.click();

  const blocks = inspector.querySelectorAll('.modifier-block');
  expect(blocks).toHaveLength(2);
  /* Deux « Pas » de 6 copies sur un calque de deux formes. */
  expect(stage.querySelectorAll('ellipse[data-element-id]')).toHaveLength(6 * 6 * 2);

  const [type] = blocks[1].querySelectorAll('select');
  type.value = 'mirrorH';
  type.dispatchEvent(new Event('change'));
  expect(stage.querySelectorAll('ellipse[data-element-id]')).toHaveLength(6 * 2 * 2);

  blocks[0].querySelector('.icon-btn.is-danger').click();
  expect(inspector.querySelectorAll('.modifier-block')).toHaveLength(1);
  expect(stage.querySelectorAll('ellipse[data-element-id]')).toHaveLength(2 * 2);

  /* Une interpolation ajoutée depuis la card du calque éteint ses copies. */
  const opacities = () =>
    [...stage.querySelectorAll('ellipse[data-element-id]')].map((node) => node.getAttribute('opacity'));
  expect(opacities()).toEqual(['1', '1', '1', '1']);

  document.querySelector('[data-focus-key="add-interpolation"]').click();
  expect(inspector.querySelectorAll('.interpolation-block')).toHaveLength(1);
  expect(opacities()).toEqual(['1', '1', '0', '0']);

  /* Cmd+Z défait l'interpolation, Cmd+Maj+Z la rétablit. */
  const key = (shiftKey) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: shiftKey ? 'Z' : 'z', metaKey: true, shiftKey }));
  key(false);
  expect(opacities()).toEqual(['1', '1', '1', '1']);
  key(true);
  expect(opacities()).toEqual(['1', '1', '0', '0']);

  /* Raccourcis : outil, dupliquer, supprimer, rien pendant la saisie. */
  const press = (init) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  const circles = () => stage.querySelectorAll('ellipse[data-element-id]').length;
  press({ key: 'r' });
  expect(document.getElementById('shape-rect').checked).toBe(true);
  press({ key: 'd', metaKey: true });
  expect(circles()).toBe(3 * 2);
  press({ key: 'Delete' });
  expect(circles()).toBe(2 * 2);
  const field = document.createElement('input');
  document.body.append(field);
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  expect(circles()).toBe(2 * 2);
  field.remove();

  /* Maj+clic dans l'arbre : dupliquer et supprimer valent pour la sélection entière, en un pas. */
  const names = () => [...document.querySelectorAll('#shape-list .layer-name')];
  names()[0].click();
  names()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  expect(document.querySelectorAll('#shape-list [aria-pressed="true"]')).toHaveLength(2);
  press({ key: 'd', metaKey: true });
  expect(circles()).toBe(4 * 2);
  press({ key: 'Delete' });
  expect(circles()).toBe(2 * 2);
  key(false);
  expect(circles()).toBe(4 * 2);
  key(false);
  expect(circles()).toBe(2 * 2);

  /* Sans forme sélectionnée, Suppr vise le calque actif. */
  const layerCount = () => document.querySelectorAll('.layer-card[data-layer-id]').length;
  const before = layerCount();
  press({ key: 'Escape' });
  press({ key: 'Delete' });
  expect(layerCount()).toBe(before - 1);
  key(false);
  expect(layerCount()).toBe(before);

  /* Clavier de l'arbre : ↑/↓ parcourent les lignes sans pousser la forme,
     Retour arrière supprime la ligne qui a le focus, pas la sélection. */
  const rows = () => [...document.querySelectorAll('#layer-panel .layer-name')];
  const shapeIds = () => [...document.querySelectorAll('#shape-list [data-element-id]')].map((n) => n.dataset.elementId);
  const onRow = (row, key) => row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  document.querySelector('#shape-list .layer-name').click();
  const selected = () => stage.querySelector('[data-element-id]').getAttribute('cx');
  const [kept, target] = shapeIds();
  const position = selected();
  const shapeRows = () => rows().filter((row) => row.closest('#shape-list'));
  shapeRows()[0].focus();
  onRow(shapeRows()[0], 'ArrowDown');
  expect(document.activeElement).toBe(shapeRows()[1]);
  expect(selected()).toBe(position);
  onRow(shapeRows()[1], 'ArrowUp');
  expect(document.activeElement).toBe(shapeRows()[0]);
  onRow(shapeRows()[1], 'Backspace');
  expect(shapeIds()).toEqual([kept]);
  expect(shapeIds()).not.toContain(target);
  key(false);

  /* Grille : la case pose le fond, et le geste suivant tombe sur un croisement. */
  const grid = document.getElementById('settings-grid');
  grid.checked = true;
  grid.dispatchEvent(new Event('change'));
  expect(stage.hasAttribute('data-grid')).toBe(true);
  pointer('pointerdown', 130, 44);
  pointer('pointerup', 130, 44);
  const rect = stage.querySelector('rect[data-element-id]');
  /* (130, 44) → croisement (90, 0) ; le `<rect>` se place par son coin. */
  expect([rect.getAttribute('x'), rect.getAttribute('y')]).toEqual(['20', '-45']);

  /* Grille ronde : le geste tombe sur un croisement cercle × rayon. */
  const gridType = document.getElementById('settings-grid-type');
  gridType.value = 'polar';
  gridType.dispatchEvent(new Event('change'));
  expect(document.getElementById('settings-circles').closest('label').hidden).toBe(false);
  expect(stage.style.backgroundImage).toContain('data:image/svg+xml');
  /* 8 cercles de 56,25, 10 rayons : (460, 280) → 3ᵉ cercle, rayon du haut. */
  pointer('pointerdown', 460, 280);
  pointer('pointerup', 460, 280);
  const rects = stage.querySelectorAll('rect[data-element-id]');
  expect([rects[1].getAttribute('x'), rects[1].getAttribute('y')]).toEqual(['380', '236.25']);

  /* Nuancier de la carte du trait : la couleur hors palette y figure, cerclée,
     et marquée puisque l'autre rectangle la porte ; un clic en applique une autre. */
  const card = document.getElementById('stroke-card');
  expect(inspector.querySelector('.swatch')).toBeNull();
  expect(card.querySelector('.stroke-current').style.getPropertyValue('--swatch')).toBe('#7dd3c0');
  const swatch = (color) => card.querySelector(`.swatch[data-color="${color}"]`);
  expect(swatch('#7dd3c0').getAttribute('aria-pressed')).toBe('true');
  expect(swatch('#7dd3c0').hasAttribute('data-used')).toBe(true);
  swatch('#ee4722').click();
  expect(swatch('#ee4722').getAttribute('aria-pressed')).toBe('true');
  expect(swatch('#7dd3c0').getAttribute('aria-pressed')).toBe('false');
  expect(swatch('#7dd3c0').title).toContain('Calque 1');
  expect(card.querySelectorAll('.swatch[data-color="#ee4722"]')).toHaveLength(1);
  /* L'épaisseur se règle depuis la carte. */
  const width = document.getElementById('stroke-width');
  width.value = '4';
  width.dispatchEvent(new Event('change'));
  const active = rects[1].dataset.elementId;
  expect(stage.querySelector(`rect[data-element-id="${active}"]`).getAttribute('stroke-width')).toBe('4');
  /* Une couleur par forme, copies confondues. */
  const strokes = () => [
    ...new Map(
      [...stage.querySelectorAll('rect[data-element-id]')].map((node) => [node.dataset.elementId, node.getAttribute('stroke')]),
    ).values(),
  ];
  expect(strokes()).toEqual(['#7dd3c0', '#ee4722']);
  /* La forme suivante reprend la couleur de la dernière créée. */
  pointer('pointerdown', 460, 460);
  pointer('pointerup', 460, 460);
  expect(strokes()).toEqual(['#7dd3c0', '#ee4722', '#ee4722']);
  /* Plusieurs formes de couleurs différentes : la carte dit « multi », un clic les accorde. */
  const rectIds = [...new Set([...stage.querySelectorAll('rect[data-element-id]')].map((node) => node.dataset.elementId))];
  const shapeName = (id) => document.querySelector(`#shape-list [data-element-id="${id}"] .layer-name`);
  shapeName(rectIds[0]).click();
  shapeName(rectIds[1]).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  expect(card.querySelector('.stroke-current').hasAttribute('data-mixed')).toBe(true);
  expect(document.getElementById('stroke-width').placeholder).toBe('multi');
  swatch('#ee4722').click();
  expect(strokes()).toEqual(['#ee4722', '#ee4722', '#ee4722']);
  expect(card.querySelector('.stroke-current').hasAttribute('data-mixed')).toBe(false);
  width.value = '2';
  width.dispatchEvent(new Event('change'));
  expect(document.getElementById('stroke-width').placeholder).toBe('');
  shapeName(rectIds[0]).click();
  swatch('#7dd3c0').click();
  expect(strokes()).toEqual(['#7dd3c0', '#ee4722', '#ee4722']);
  shapeName(rectIds[2]).click();
  swatch('#7dd3c0').click();
  expect(swatch('#7dd3c0').getAttribute('aria-pressed')).toBe('true');
  /* Palette globale : accent + blanc, plus les couleurs portées par le dessin. */
  const colors = () => [...card.querySelectorAll('.swatch[data-color]')].map((s) => s.dataset.color);
  expect(colors()).toEqual(['#ee4722', '#fcfaf3', '#7dd3c0']);

  /* Sans sélection, la carte règle le style des prochaines formes. */
  press({ key: 'Escape' });
  expect(card.querySelector('.stroke-current').disabled).toBe(false);
  swatch('#fcfaf3').click();
  expect(strokes()).toEqual(['#7dd3c0', '#ee4722', '#7dd3c0']);
  pointer('pointerdown', 200, 460);
  pointer('pointerup', 200, 460);
  expect(strokes().at(-1)).toBe('#fcfaf3');

  /* Sans calque, dessiner en crée un ; un seul ⌘Z défait calque et forme. */
  while (layerCount()) {
    press({ key: 'Escape' });
    press({ key: 'Delete' });
  }
  pointer('pointerdown', 300, 300);
  pointer('pointerup', 330, 300);
  expect(layerCount()).toBe(1);
  expect(stage.querySelectorAll('[data-element-id]')).toHaveLength(1);
  key(false);
  expect(layerCount()).toBe(0);

  /* Dessiner sur un calque masqué le réaffiche : la forme ne reste pas invisible. */
  pointer('pointerdown', 300, 300);
  pointer('pointerup', 330, 300);
  document.querySelector('[data-focus-key^="visible-"]').click();
  expect(stage.querySelectorAll('[data-element-id]')).toHaveLength(0);
  pointer('pointerdown', 500, 500);
  pointer('pointerup', 530, 500);
  expect(stage.querySelectorAll('[data-element-id]')).toHaveLength(2);
  /* Un seul ⌘Z défait forme et réaffichage ensemble. */
  key(false);
  expect(stage.querySelectorAll('[data-element-id]')).toHaveLength(0);
});

