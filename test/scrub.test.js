// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { createStore } from '../src/store.js';
import { createScene, getActiveLayer, setLayerStrokeWidth } from '../src/scene.js';
import { mountHistory } from '../src/ui/history.js';
import { mountScrub, scrubValue } from '../src/ui/scrub.js';

const numberInput = (attrs) => Object.assign(document.createElement('input'), { type: 'number', ...attrs });

it('fait varier par pas, borne et respecte les décimales du step', () => {
  const input = numberInput({ step: '0.5', min: '0', max: '20' });
  expect(scrubValue(input, 2, 8, false)).toBe('3');
  expect(scrubValue(input, 2, -400, false)).toBe('0');
  expect(scrubValue(input, 2, 4, true)).toBe('7');
  expect(scrubValue(input, 19, 400, false)).toBe('20');
});

it('un glissement entier = un seul pas d’annulation', () => {
  const store = createStore(createScene());
  mountHistory({ store });
  mountScrub();
  const input = numberInput({ step: '1', value: '1' });
  document.body.append(input);
  input.addEventListener('change', () =>
    store.apply(setLayerStrokeWidth, store.get().activeLayerId, Number(input.value)),
  );
  const width = () => getActiveLayer(store.get()).strokeWidth;
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
