import { activePlane, DEFAULT_PLANE, MAX_TILT, PLANE_SIDES, setLayerPlane } from '../scene.js';
import { el, field, input, select, switchField } from './fields.js';

/**
 * Plan 3D du calque actif : le motif, composé à plat, est posé sur un plan
 * incliné ; chaque forme s'extrude de sa profondeur. Éteint, le calque reste à
 * plat et le plan garde ses réglages. `bind` et `slider` relient au calque.
 */
export const planeFields = ({ store, bind, slider }) => {
  const layerOnly = { subject: 'layer' };
  const planeOn = bind(
    input('checkbox'),
    (layer) => activePlane(layer) !== null,
    (layer, on) => store.apply(setLayerPlane, layer.id, on ? {} : null),
    { ...layerOnly, event: 'change' },
  );
  const planeOf = (layer) => layer.plane ?? DEFAULT_PLANE;
  const angle = (label, max, key) =>
    slider(
      label,
      { min: '0', max, step: '1' },
      (layer) => planeOf(layer)[key],
      (layer, value) => store.apply(setLayerPlane, layer.id, { [key]: value }),
      layerOnly,
    );
  const sides = select(Object.entries(PLANE_SIDES));
  bind(
    sides,
    (layer) => planeOf(layer).sides,
    (layer, value) => store.apply(setLayerPlane, layer.id, { sides: value }),
    { ...layerOnly, event: 'change', parse: String },
  );
  const settings = el('div', 'group');
  settings.append(angle('Inclinaison (°)', String(MAX_TILT), 'tilt'), angle('Orientation (°)', '359', 'heading'), field('Flancs', sides));
  const root = el('section', 'group');
  root.append(switchField('Plan 3D', planeOn), settings);

  return { root, sync: (layer) => { settings.hidden = !activePlane(layer); } };
};
