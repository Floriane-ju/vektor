// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { addElement, createScene, moveElement, selectElements, SHAPES } from '../src/scene.js';
import { createStore } from '../src/store.js';
import { mountLayerPanel } from '../src/ui/layer-panel.js';
import { mountShapeList } from '../src/ui/shape-list.js';

let store;
const status = { show: () => {} };
const names = (selector) => [...document.querySelectorAll(`${selector} .tree-name`)].map((node) => node.textContent);
const key = (node, name) => node.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
const editing = () => document.querySelector('.rename-input');
const type = (text, finish) => {
  const field = editing();
  field.value = text;
  key(field, finish);
};

beforeEach(() => {
  document.body.innerHTML = '<div id="layers"></div><div id="shapes"></div>';
  let scene = createScene();
  const layerId = scene.activeLayerId;
  scene = addElement(addElement(scene, layerId, 'ellipse', 0, 0), layerId, 'rect', 0, 0);
  store = createStore(scene);
  const shapes = document.getElementById('shapes');
  mountShapeList({ store, container: shapes, status });
  mountLayerPanel({ store, container: document.getElementById('layers'), status, children: shapes });
});

it('F2 renomme un calque en place, Entrée valide, Échap annule', () => {
  const name = () => document.querySelector('#layers > ul > li > .tree-row .tree-name');
  key(name(), 'F2');
  expect(editing().value).toBe('Calque 1');
  type('Fond', 'Escape');
  expect(editing()).toBeNull();
  expect(name().textContent).toBe('Calque 1');

  name().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  type('Fond', 'Enter');
  expect(name().textContent).toBe('Fond');
  expect(document.activeElement).toBe(name());
  /* Vidé, le nom d'un calque ne change pas. */
  key(name(), 'F2');
  type('  ', 'Enter');
  expect(name().textContent).toBe('Fond');
});

it('une forme nommée garde son nom quand on la réordonne', () => {
  expect(names('#shapes')).toEqual([`${SHAPES.rect.label} 2`, `${SHAPES.ellipse.label} 1`]);
  const ellipseName = document.querySelectorAll('#shapes .tree-name')[1];
  key(ellipseName, 'F2');
  type('Soleil', 'Enter');
  expect(names('#shapes')).toEqual([`${SHAPES.rect.label} 2`, 'Soleil']);

  const ellipseId = store.get().layers[0].elements[0].id;
  store.apply(moveElement, ellipseId, 1);
  expect(names('#shapes')).toEqual(['Soleil', `${SHAPES.rect.label} 1`]);

  /* Vider le champ rend le libellé par défaut. */
  key(document.querySelector('#shapes .tree-name'), 'F2');
  type('', 'Enter');
  expect(names('#shapes')).toEqual([`${SHAPES.ellipse.label} 2`, `${SHAPES.rect.label} 1`]);
});

it('les autres formes de la sélection portent `data-in-selection`, la forme active non', () => {
  const [first, second] = store.get().layers[0].elements;
  store.apply(selectElements, [first.id, second.id]);
  const card = (id) => document.querySelector(`#shapes [data-element-id="${id}"]`)?.closest('.tree-item');
  const active = store.get().activeElementId;
  const other = active === first.id ? second.id : first.id;
  expect(card(other).hasAttribute('data-in-selection')).toBe(true);
  expect(card(active).hasAttribute('data-in-selection')).toBe(false);
  expect(document.querySelector('#layers [data-selected]').dataset.selected).toBe('parent');
});
