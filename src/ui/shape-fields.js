import {
  activePlane,
  ARC_CLOSURES,
  clampAngle,
  clampExtent,
  clampHeight,
  clampInner,
  clampSides,
  SHAPES,
  updateElement,
} from '../scene.js';
import { field, input, row, select, switchField } from './fields.js';

/* Une ligne n'a ni largeur ni hauteur : ces deux champs y désignent l'écart
   entre ses extrémités, signe compris. */
const SPAN_LABELS = { signed: ['Écart X', 'Écart Y'], default: ['Largeur', 'Hauteur'] };

/* Position et taille. Les champs sont en dimensions pleines côté interface —
   un rayon, une largeur — alors que le modèle stocke des demi-extensions depuis
   le centre. La conversion se fait ici, au seul endroit où l'utilisateur lit
   ces nombres. */
const sizeFields = (store, bind) => {
  const patch = (element, values) => store.apply(updateElement, element.id, values);
  const position = (key) =>
    bind(
      input('number', { step: '1' }),
      (element) => Math.round(element[key]),
      (element, value) => patch(element, { [key]: value }),
      { event: 'change' },
    );
  const radius = bind(
    input('number', { min: '0', step: '1' }),
    (element) => Math.round(element.rx),
    (element, value) => patch(element, { rx: Math.max(0, value), ry: Math.max(0, value) }),
  );
  /* Pas de `min` : une ligne a des dimensions signées, et les formes qui n'en
     veulent pas sont ramenées à zéro par `clampExtent`. */
  const extent = (key) =>
    bind(
      input('number', { step: '1' }),
      (element) => Math.round(element[key] * 2),
      (element, value) => patch(element, { [key]: clampExtent(element.type, value) / 2 }),
    );
  const radiusField = field('Rayon', radius);
  const widthField = field('Largeur', extent('rx'));
  const heightField = field('Hauteur', extent('ry'));
  const root = row(radiusField, widthField, heightField, field('X', position('x')), field('Y', position('y')));
  /* Deux par ligne : les quatre champs tronquaient leurs valeurs sur une seule. */
  root.classList.add('is-grid');

  const sync = (element) => {
    const { geometry, uniform, signed } = SHAPES[element.type];
    /* Un tracé se dimensionne par ses sommets, pas par des champs ; un point
       par son épaisseur, qui lui donne son diamètre. */
    const trace = geometry === 'polyline';
    radiusField.hidden = !uniform || geometry === 'dot' || trace;
    widthField.hidden = uniform || trace;
    heightField.hidden = uniform || trace;
    const [widthLabel, heightLabel] = SPAN_LABELS[signed ? 'signed' : 'default'];
    widthField.querySelector('label').textContent = widthLabel;
    heightField.querySelector('label').textContent = heightLabel;
  };
  return { root, sync };
};

/* Réglages propres à un type : côtés d'un polygone, angles d'un arc, tracé fermé. */
const typeFields = (store, bind) => {
  const patch = (element, values) => store.apply(updateElement, element.id, values);
  const sides = bind(
    input('number', { min: '3', step: '1' }),
    (element) => element.sides,
    (element, value) => patch(element, { sides: clampSides(value) }),
    { event: 'change' },
  );
  const inner = bind(
    input('number', { min: '0', max: '100', step: '1' }),
    (element) => element.inner,
    (element, value) => patch(element, { inner: clampInner(value) }),
  );
  const angle = (key) =>
    bind(
      input('number', { min: '-360', max: '360', step: '1' }),
      (element) => element[key],
      (element, value) => patch(element, { [key]: clampAngle(value) }),
    );
  const closure = select(Object.entries(ARC_CLOSURES));
  bind(closure, (element) => element.closure, (element, value) => patch(element, { closure: value }), {
    event: 'change',
    parse: String,
  });
  const closed = bind(
    input('checkbox'),
    (element) => element.closed,
    (element, value) => patch(element, { closed: value }),
    { event: 'change' },
  );

  /* 100 % : polygone convexe ; en deçà, étoile. */
  const polygonRow = row(field('Côtés', sides), field('Rayon intérieur (%)', inner));
  /* 0° en haut, sens horaire ; de 0 à 360 l'arc fait le tour complet. */
  const arcRow = row(field('Début (°)', angle('start')), field('Fin (°)', angle('end')), field('Fermeture', closure));
  const closedField = switchField('Fermé', closed);

  const sync = (element) => {
    const { geometry } = SHAPES[element.type];
    polygonRow.hidden = geometry !== 'polygon';
    arcRow.hidden = geometry !== 'arc';
    closedField.hidden = geometry !== 'polyline';
  };
  return { nodes: [polygonRow, arcRow, closedField], sync };
};

/**
 * Géométrie de la forme active : taille et position, rotation, profondeur 3D,
 * puis les réglages propres à son type. `bind` relie un champ à la forme
 * active (voir `mountPropertyPanel`).
 */
export const shapeFields = ({ store, bind }) => {
  const size = sizeFields(store, bind);
  const rotation = bind(
    input('number', { step: '1' }),
    (element) => element.rotation ?? 0,
    (element, value) => store.apply(updateElement, element.id, { rotation: value % 360 }),
  );
  const rotationField = field('Rotation (°)', rotation);
  /* Hauteur d'extrusion le long de la normale du plan 3D du calque. */
  const depth = bind(
    input('number', { min: '0', step: '1' }),
    (element) => element.height ?? 0,
    (element, value) => store.apply(updateElement, element.id, { height: clampHeight(value) }),
  );
  const depthField = field('Profondeur', depth);
  depthField.title = 'Épaisseur extrudée le long du plan 3D du calque, centrée sur le plan';
  const opaque = bind(input('checkbox'), (element) => element.opaque !== false, (element, value) => store.apply(updateElement, element.id, { opaque: value }), {
    event: 'change',
  });
  const opaqueField = switchField('Opaque', opaque);
  opaqueField.title = 'Le volume cache ce qui est dessiné derrière lui';
  const types = typeFields(store, bind);

  const sync = (element, layer) => {
    size.sync(element);
    types.sync(element);
    /* Un point tourné reste identique : rien à régler. */
    rotationField.hidden = SHAPES[element.type].geometry === 'dot';
    /* ponytail: une forme à booléens ne s'extrude pas (voir `createExtrusion`). */
    depthField.hidden = !activePlane(layer) || element.booleans.length > 0;
    opaqueField.hidden = depthField.hidden || !(element.height > 0);
  };
  return { nodes: [size.root, rotationField, depthField, opaqueField, ...types.nodes], sync };
};
