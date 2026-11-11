// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { createStore } from '../src/store.js';
import { addElement, createScene, getActiveElement, updateElement } from '../src/scene.js';
import { mountHistory } from '../src/ui/history.js';
import { mountScrub, scrubValue, wrap } from '../src/ui/scrub.js';

const numberInput = (attrs) => Object.assign(document.createElement('input'), { type: 'number', ...attrs });

it('fait varier par pas, borne et respecte les décimales du step', () => {
  const input = numberInput({ step: '0.5', min: '0', max: '20' });
  expect(scrubValue(input, 2, 8, false)).toBe('3');
  expect(scrubValue(input, 2, -400, false)).toBe('0');
  expect(scrubValue(input, 2, 4, true)).toBe('7');
  expect(scrubValue(input, 19, 400, false)).toBe('20');
});

it('un glissement entier = un seul pas d’annulation', () => {
  const scene = createScene();
  const store = createStore(addElement(scene, scene.activeLayerId, 'ellipse', 0, 0));
  mountHistory({ store });
  mountScrub();
  const input = numberInput({ step: '1', value: '1' });
  document.body.append(input);
  input.addEventListener('change', () =>
    store.apply(updateElement, store.get().activeElementId, { strokeWidth: Number(input.value) }),
  );
  const width = () => getActiveElement(store.get()).strokeWidth;
  const before = width();

  const fire = (type, clientX) =>
    input.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX }));
  fire('pointerdown', 100);
  for (const x of [104, 108, 112]) fire('pointermove', x);
  fire('pointerup', 112);

  expect(input.value).toBe('4');
  expect(width()).toBe(4);
  store.undo();
  expect(width()).toBe(before);
});

it('repasse de l’autre côté de l’écran', () => {
  expect(wrap(1010, 1000)).toBe(10);
  expect(wrap(-10, 1000)).toBe(990);
  expect(wrap(500, 1000)).toBe(500);
});

it('pointeur verrouillé : la valeur suit movementX, le faux curseur fait le tour', () => {
  mountScrub();
  const input = numberInput({ step: '1', value: '0' });
  document.body.append(input);
  let lockedTo = null;
  input.requestPointerLock = () => {
    lockedTo = input;
  };
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedTo });
  document.exitPointerLock = () => {
    lockedTo = null;
  };
  const fire = (type, init) => input.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, ...init }));

  fire('pointerdown', { clientX: window.innerWidth - 4, clientY: 10 });
  fire('pointermove', { clientX: window.innerWidth, clientY: 10, movementX: 4 }); // seuil franchi : verrou
  expect(lockedTo).toBe(input);
  for (let i = 0; i < 5; i += 1) fire('pointermove', { movementX: 4, movementY: 0 });
  expect(input.value).toBe('6'); // (4 + 20) / 4
  const ghost = document.querySelector('.scrub-ghost');
  expect(ghost).not.toBeNull();
  expect(parseFloat(ghost.style.translate)).toBeLessThan(window.innerWidth / 2);

  fire('pointerup', {});
  expect(lockedTo).toBeNull();
  expect(document.querySelector('.scrub-ghost')).toBeNull();
  delete document.pointerLockElement;
});
