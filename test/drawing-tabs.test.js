// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { addLayer, createScene } from '../src/scene.js';
import { loadDrawings, loadLocal, saveDrawings, sceneKey, serialize } from '../src/persistence.js';
import { createStore } from '../src/store.js';
import { mountDrawingTabs } from '../src/ui/drawing-tabs.js';

beforeEach(() => localStorage.clear());

it('relit la liste des onglets, bornée, avec repli sur « Vektor 1 »', () => {
  expect(loadDrawings()).toEqual({ tabs: [{ id: 'D1', name: 'Vektor 1' }], active: 'D1' });
  localStorage.setItem('illu/drawings', '{');
  expect(loadDrawings().active).toBe('D1');
  saveDrawings({ tabs: [{ id: 'D2', name: '  ' }, { id: 'x' }, { id: 'D2', name: 'double' }], active: 'D9' });
  expect(loadDrawings()).toEqual({ tabs: [{ id: 'D2', name: 'Vektor 2' }], active: 'D2' });
  expect(sceneKey('D1')).toBe('illu:scene:v1');
});

it('ouvre un dessin vierge, revient au premier avec sa scène', () => {
  const container = document.createElement('div');
  const store = createStore(addLayer(createScene()));
  const original = store.get();
  const switched = [];
  mountDrawingTabs({
    store,
    container,
    status: { show() {} },
    drawings: loadDrawings(),
    beforeSwitch: (next) => switched.push(next),
    afterSwitch() {},
  });

  container.querySelector('.drawing-new').click();
  const names = () => [...container.querySelectorAll('.drawing-tab-name')].map((node) => node.textContent);
  expect(names()).toEqual(['Vektor 1', 'Vektor 2']);
  /* L'onglet ajouté reste marqué pour son animation d'entrée. */
  expect(container.querySelectorAll('.drawing-tab')[1].hasAttribute('data-enter')).toBe(true);
  expect(store.get().layers.length).toBeLessThan(original.layers.length);
  expect(loadDrawings().active).toBe('D2');

  container.querySelector('.drawing-tab-name').click();
  expect(store.get()).toBe(original);

  /* Fermer un dessin vide ne demande rien et efface sa sauvegarde. */
  localStorage.setItem(sceneKey('D2'), serialize(createScene(), 0));
  container.querySelectorAll('.drawing-tab-close')[1].click();
  expect(names()).toEqual(['Vektor 1']);
  expect(loadLocal(sceneKey('D2')).scene).toBeNull();
  expect(container.querySelector('.drawing-tab-close')).toBeNull();
});
