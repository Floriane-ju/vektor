import {
  activePlane,
  addModifier,
  ARC_CLOSURES,
  clampAngle,
  clampDash,
  clampLinecap,
  clampExtent,
  clampGap,
  clampHeight,
  clampInner,
  clampSides,
  getActiveElement,
  getActiveLayer,
  moveModifier,
  pivotOf,
  removeModifier,
  DASH_PRESETS,
  DEFAULT_PLANE,
  LINECAPS,
  MAX_TILT,
  PLANE_SIDES,
  setLayerCenter,
  setLayerEvenOdd,
  setLayerPlane,
  SHAPES,
  updateElement,
  updateModifier,
} from '../scene.js';
import { iconButton, rebuildWithFocus, shapeName } from './list.js';
import { interpolationSection } from './interpolation-section.js';
import { booleanSection } from './boolean-section.js';
import {
  axisAngle,
  copyCount,
  FIXED_COPIES,
  MAX_COPIES,
  MIRROR_AXIS,
  MODIFIER_LABELS,
  ORIENTING,
  orients,
  PIVOTING,
} from '../modifiers.js';

/**
 * Panneau de droite : les réglages du calque actif, ou ceux de la forme
 * sélectionnée — jamais les deux. Construits une seule fois et ensuite
 * synchronisés.
 *
 * Les reconstruire à chaque notification arracherait le focus du curseur en
 * cours de glissement : chaque `input` notifie le store, qui redessine — et le
 * slider disparaîtrait sous la souris au premier pixel.
 */

/* Bornes des curseurs. Le champ numérique voisin accepte au-delà : le curseur
   couvre l'usage courant sans plafonner le modèle. */
const COUNT_SLIDER = { min: '1', max: '64', step: '1' };
const DASH_SLIDER = { min: '0.5', max: '16', step: '0.5' };

let uid = 0;
const nextId = () => `prop-${++uid}`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const field = (labelText, control) => {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
};

const row = (...children) => {
  const node = el('div', 'field-row');
  node.append(...children);
  return node;
};

const separator = () => el('hr', 'separator');

const option = (value, label) => {
  const node = el('option', null, label);
  node.value = value;
  return node;
};

const input = (type, attrs = {}) => {
  const node = document.createElement('input');
  node.type = type;
  node.id = nextId();
  Object.assign(node, attrs);
  return node;
};

const select = (entries) => {
  const node = document.createElement('select');
  node.id = nextId();
  for (const [value, label] of entries) node.append(option(value, label));
  return node;
};

/* Case à cocher habillée en interrupteur ; la case reste native. */
const switchField = (labelText, checkbox) => {
  checkbox.classList.add('switch');
  const label = el('label', 'switch-field');
  label.append(el('span', null, labelText), checkbox);
  return label;
};

/* Entête d'une section : titre, et son bouton d'ajout à droite. */
const sectionHead = (title, addButton) => {
  const head = el('div', 'section-head');
  head.append(el('h3', null, title), addButton);
  return head;
};

const addButtonFor = (label, focusKey, onClick) => {
  const node = el('button', 'text-btn', '+ Ajouter');
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  node.dataset.focusKey = focusKey;
  node.addEventListener('click', onClick);
  return node;
};

/* Entête du panneau : ce qu'on règle (« Calque », « Forme ») et son nom. */
const inspectorHead = (kind) => {
  const head = el('div', 'inspector-head');
  const eyebrow = el('div', 'inspector-kind');
  eyebrow.append(el('span', null, kind));
  const title = el('h2', 'inspector-title');
  head.append(eyebrow, title);
  return { head, title };
};

export const mountPropertyPanel = ({ store, container = null }) => {
  const controls = [];

  /**
   * Relie un `input` à une transition de scène.
   *
   * `subject` dit ce que le contrôle édite : la forme active pour les champs de
   * forme, le calque actif pour les modificateurs. Le contrôle
   * ne s'écrit pas quand son sujet est absent.
   */
  const bind = (
    node,
    read,
    write,
    { event = 'input', parse = Number, subject = 'element', into = controls } = {},
  ) => {
    node.addEventListener(event, () => {
      const scene = store.get();
      const target = subject === 'element' ? getActiveElement(scene) : getActiveLayer(scene);
      if (target) write(target, parse(node.value));
    });
    into.push({ node, read, subject });
    return node;
  };

  /**
   * Curseur doublé d'un champ numérique : le curseur pour le geste, le champ
   * pour une valeur précise ou hors des bornes du curseur.
   */
  const slider = (labelText, attrs, read, write, options = {}) => {
    const range = bind(input('range', attrs), read, write, options);
    const number = bind(input('number', { step: attrs.step, min: attrs.min }), read, write, {
      ...options,
      event: 'change',
    });
    number.className = 'range-value';
    number.setAttribute('aria-label', labelText);
    const wrap = el('div', 'field slider-field');
    const head = el('div', 'slider-head');
    const label = el('label', null, labelText);
    label.htmlFor = range.id;
    head.append(label, number);
    wrap.append(head, range);
    return wrap;
  };

  /**
   * Choix exclusif en segments : des radios natifs, donc flèches et annonce du
   * groupe par le navigateur. `read` rend la valeur cochée, ou rien.
   */
  const segmented = (legendText, entries, read, pick, { subject = 'element' } = {}) => {
    const root = el('fieldset', 'segmented');
    const track = el('div', 'segments');
    root.append(el('legend', null, legendText), track);
    const name = nextId();
    const radios = entries.map(([value, label]) => {
      const radio = input('radio', { name, value });
      radio.addEventListener('change', () => {
        const target = getActiveElement(store.get());
        if (radio.checked && target) pick(target, value);
      });
      const wrap = el('label', 'segment');
      wrap.append(radio, el('span', null, label));
      track.append(wrap);
      return radio;
    });
    controls.push({
      subject,
      sync: (target) => {
        const value = read(target);
        for (const radio of radios) radio.checked = radio.value === value;
      },
    });
    return root;
  };

  /* ---- Forme ---- */

  const shapeHead = inspectorHead('Forme');

  const posX = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.x),
    (element, value) => store.apply(updateElement, element.id, { x: value }),
    { event: 'change' },
  );
  const posY = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.y),
    (element, value) => store.apply(updateElement, element.id, { y: value }),
    { event: 'change' },
  );

  /* Les champs sont en dimensions pleines côté interface — un rayon, une
     largeur — alors que le modèle stocke des demi-extensions depuis le centre.
     La conversion se fait ici, au seul endroit où l'utilisateur lit ces
     nombres. */
  const radius = bind(
    input('number', { min: '0', step: '1' }),
    (element) => Math.round(element.rx),
    (element, value) =>
      store.apply(updateElement, element.id, { rx: Math.max(0, value), ry: Math.max(0, value) }),
  );
  /* Pas de `min` : une ligne a des dimensions signées, et les formes qui n'en
     veulent pas sont ramenées à zéro par `clampExtent`. */
  const width = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.rx * 2),
    (element, value) =>
      store.apply(updateElement, element.id, { rx: clampExtent(element.type, value) / 2 }),
  );
  const height = bind(
    input('number', { step: '1' }),
    (element) => Math.round(element.ry * 2),
    (element, value) =>
      store.apply(updateElement, element.id, { ry: clampExtent(element.type, value) / 2 }),
  );
  const sides = bind(
    input('number', { min: '3', step: '1' }),
    (element) => element.sides,
    (element, value) => store.apply(updateElement, element.id, { sides: clampSides(value) }),
    { event: 'change' },
  );
  const inner = bind(
    input('number', { min: '0', max: '100', step: '1' }),
    (element) => element.inner,
    (element, value) => store.apply(updateElement, element.id, { inner: clampInner(value) }),
  );
  const rotation = bind(
    input('number', { step: '1' }),
    (element) => element.rotation ?? 0,
    (element, value) => store.apply(updateElement, element.id, { rotation: value % 360 }),
  );
  const arcStart = bind(
    input('number', { min: '-360', max: '360', step: '1' }),
    (element) => element.start,
    (element, value) => store.apply(updateElement, element.id, { start: clampAngle(value) }),
  );
  const arcEnd = bind(
    input('number', { min: '-360', max: '360', step: '1' }),
    (element) => element.end,
    (element, value) => store.apply(updateElement, element.id, { end: clampAngle(value) }),
  );
  const closure = select(Object.entries(ARC_CLOSURES));
  bind(
    closure,
    (element) => element.closure,
    (element, value) => store.apply(updateElement, element.id, { closure: value }),
    { event: 'change', parse: String },
  );
  /* Le remplissage n'a pas de teinte propre : il reprend la couleur de la forme. */
  const filled = bind(
    input('checkbox'),
    (element) => element.filled,
    (element, value) => store.apply(updateElement, element.id, { filled: value }),
    { event: 'change', parse: () => filled.checked },
  );
  const closed = bind(
    input('checkbox'),
    (element) => element.closed,
    (element, value) => store.apply(updateElement, element.id, { closed: value }),
    { event: 'change', parse: () => closed.checked },
  );

  /* Hauteur d'extrusion le long de la normale du plan 3D du calque. */
  const depth = bind(
    input('number', { min: '0', step: '1' }),
    (element) => element.height ?? 0,
    (element, value) => store.apply(updateElement, element.id, { height: clampHeight(value) }),
  );
  const depthField = field('Profondeur', depth);
  depthField.title = 'Épaisseur extrudée le long du plan 3D du calque, centrée sur le plan';

  const booleans = booleanSection({ store });

  const radiusField = field('Rayon', radius);
  const widthField = field('Largeur', width);
  const heightField = field('Hauteur', height);
  /* Une ligne n'a ni largeur ni hauteur : ces deux champs y désignent l'écart
     entre ses extrémités, signe compris. */
  const spanLabels = { signed: ['Écart X', 'Écart Y'], default: ['Largeur', 'Hauteur'] };

  const geometryRow = row(radiusField, widthField, heightField, field('X', posX), field('Y', posY));
  /* Deux par ligne : les quatre champs tronquaient leurs valeurs sur une seule. */
  geometryRow.classList.add('is-grid');
  const rotationField = field('Rotation (°)', rotation);
  /* 100 % : polygone convexe ; en deçà, étoile. */
  const polygonRow = row(field('Côtés', sides), field('Rayon intérieur (%)', inner));
  /* 0° en haut, sens horaire ; de 0 à 360 l'arc fait le tour complet. */
  const arcRow = row(field('Début (°)', arcStart), field('Fin (°)', arcEnd), field('Fermeture', closure));
  const closedField = switchField('Fermé', closed);
  const filledField = switchField('Remplir', filled);

  /* Trait : le type de motif se lit sur le tableau de tirets — vide, plein ;
     un premier tiret nul, des points ; sinon des tirets, réglés par tiret et espace.
     Valeurs en multiples de l'épaisseur de la forme. */
  const dashKind = (dash) => (dash.length === 0 ? 'solid' : dash[0] === 0 ? 'dotted' : 'dashed');
  const dashSegments = segmented(
    'Trait',
    Object.entries(DASH_PRESETS).map(([value, { label }]) => [value, label]),
    (element) => dashKind(element.dash),
    (element, value) => {
      const { label, ...patch } = DASH_PRESETS[value];
      store.apply(updateElement, element.id, patch);
    },
  );
  const dashLength = slider(
    'Longueur des tirets — × épaisseur',
    DASH_SLIDER,
    (element) => element.dash[0] ?? 0,
    (element, value) => {
      const [, ...rest] = element.dash;
      store.apply(updateElement, element.id, {
        dash: clampDash([Math.max(0, value), ...(rest.length ? rest : [2])]),
      });
    },
  );
  /* Motif tiret/espace ; un motif plus long (import) perd ses valeurs au-delà
     de la deuxième dès qu'on touche l'un des deux champs. */
  const dashPart = (index) =>
    bind(
      input('number', { min: '0', step: '0.5' }),
      (element) => element.dash[index] ?? 2,
      (element, value) => {
        const [dash = 4, gap = 2] = element.dash;
        const pair = [dash, gap];
        pair[index] = Math.max(0, value);
        store.apply(updateElement, element.id, { dash: clampDash(pair) });
      },
      { event: 'change' },
    );
  const dashPairRow = row(field('Tiret (× ép.)', dashPart(0)), field('Espace (× ép.)', dashPart(1)));
  const linecapSegments = segmented(
    'Bout',
    Object.entries(LINECAPS),
    (element) => element.linecap,
    (element, value) => store.apply(updateElement, element.id, { linecap: clampLinecap(value) }),
  );
  const outlined = bind(
    input('checkbox'),
    (element) => element.outlined,
    (element, value) => store.apply(updateElement, element.id, { outlined: value }),
    { event: 'change', parse: () => outlined.checked },
  );
  const outlinedField = switchField('Contour double', outlined);
  /* Écart vide entre les deux traits, en unités du dessin comme l'épaisseur. */
  const gapField = field(
    'Séparateur',
    bind(
      input('number', { min: '0', max: '100', step: '0.5' }),
      (element) => element.gap,
      (element, value) => store.apply(updateElement, element.id, { gap: clampGap(value) }),
    ),
  );
  const strokeGroup = el('div', 'group');
  strokeGroup.append(dashSegments, dashLength, dashPairRow, linecapSegments, outlinedField, gapField);

  const shapeDetail = el('div', 'inspector-body');
  shapeDetail.dataset.kind = 'shape';
  shapeDetail.setAttribute('aria-label', 'Réglages de la forme');
  const strokeSeparator = separator();
  shapeDetail.append(
    shapeHead.head,
    separator(),
    geometryRow,
    rotationField,
    depthField,
    polygonRow,
    arcRow,
    closedField,
    strokeSeparator,
    filledField,
    strokeGroup,
    separator(),
    booleans.root,
  );

  /* ---- Calque ---- */

  const layerHead = inspectorHead('Calque');

  /* Les formes remplies du calque, copies comprises, en un tracé pair-impair. */
  const evenOdd = bind(
    input('checkbox'),
    (layer) => layer.evenOdd,
    (layer) => store.apply(setLayerEvenOdd, layer.id, evenOdd.checked),
    { subject: 'layer', event: 'change' },
  );
  const evenOddField = switchField('Recoupements creux', evenOdd);
  evenOddField.title = 'Là où deux formes remplies se recouvrent, le remplissage se creuse';

  /* ---- Plan 3D ---- */

  /* Le motif, composé à plat, est posé sur un plan incliné ; chaque forme
     s'extrude de sa hauteur Z. Éteint, le calque reste à plat. */
  const planeOn = bind(
    input('checkbox'),
    (layer) => activePlane(layer) !== null,
    (layer) => store.apply(setLayerPlane, layer.id, planeOn.checked ? {} : null),
    { subject: 'layer', event: 'change' },
  );
  const planeOf = (layer) => layer.plane ?? DEFAULT_PLANE;
  const tilt = slider(
    'Inclinaison (°)',
    { min: '0', max: String(MAX_TILT), step: '1' },
    (layer) => planeOf(layer).tilt,
    (layer, value) => store.apply(setLayerPlane, layer.id, { tilt: value }),
    { subject: 'layer' },
  );
  const heading = slider(
    'Orientation (°)',
    { min: '0', max: '359', step: '1' },
    (layer) => planeOf(layer).heading,
    (layer, value) => store.apply(setLayerPlane, layer.id, { heading: value }),
    { subject: 'layer' },
  );
  const planeSides = select(Object.entries(PLANE_SIDES));
  bind(
    planeSides,
    (layer) => planeOf(layer).sides,
    (layer, value) => store.apply(setLayerPlane, layer.id, { sides: value }),
    { subject: 'layer', event: 'change', parse: String },
  );
  const planeSettings = el('div', 'group');
  planeSettings.append(tilt, heading, field('Flancs', planeSides));
  const planeSet = el('section', 'group');
  planeSet.append(switchField('Plan 3D', planeOn), planeSettings);

  /* ---- Modificateurs ---- */

  /**
   * Un calque porte une pile : chaque bloc est un modificateur, appliqué dans
   * l'ordre affiché, et les copies se multiplient d'un étage à l'autre.
   *
   * Seule section reconstruite du panneau, et seulement quand la longueur de la
   * pile change : reconstruire à chaque notification arracherait le curseur des
   * champs, comme ailleurs dans ce panneau.
   */
  const modifierSet = el('section', 'group');
  const modifierHost = el('div', 'stack');
  const addModifierButton = addButtonFor('Ajouter un modificateur', 'add-modifier', () => {
    const layer = getActiveLayer(store.get());
    if (layer) store.apply(addModifier, layer.id);
  });
  /* Pivot du calque : celui de tout étage qui n'a pas le sien. Se déplace
     aussi à la souris, par la croix ou l'axe des repères. */
  const pivotInput = (axis) =>
    bind(
      input('number', { step: '1' }),
      (layer) => Math.round(layer.center[axis]),
      (layer, value) => store.apply(setLayerCenter, layer.id, { ...layer.center, [axis]: value }),
      { subject: 'layer' },
    );
  const layerPivot = row(field('Pivot X', pivotInput('x')), field('Pivot Y', pivotInput('y')));
  /* Total de la pile, qui multiplie : au-delà du plafond, le calque ne se rend plus. */
  const copyTotal = el('p', 'copy-count');
  copyTotal.setAttribute('aria-live', 'polite');
  modifierSet.append(sectionHead('Répéter', addModifierButton), copyTotal, layerPivot, modifierHost);

  let blocks = [];

  const modifierBlock = (index, stackSize) => {
    const blockControls = [];
    /* Tout contrôle du bloc écrit le même modificateur : son rang dans la pile. */
    const modifierOptions = (options = {}) => ({ subject: 'layer', into: blockControls, ...options });
    const write = (toPatch) => (layer, value) =>
      store.apply(updateModifier, layer.id, index, toPatch(value));
    const bindModifier = (node, read, toPatch, options = {}) =>
      bind(node, read, write(toPatch), modifierOptions(options));

    const rank = index + 1;
    const type = select(Object.entries(MODIFIER_LABELS));
    type.setAttribute('aria-label', `Type du modificateur ${rank}`);
    bindModifier(type, (layer) => layer.modifiers[index].type, (value) => ({ type: value }), {
      event: 'change',
      parse: String,
    });

    const countField = slider(
      'Copies',
      COUNT_SLIDER,
      (layer) => layer.modifiers[index].n,
      write((value) => ({ n: value })),
      modifierOptions(),
    );
    const stepX = bindModifier(
      input('number', { step: '1' }),
      (layer) => layer.modifiers[index].stepX,
      (value) => ({ stepX: value }),
    );
    const stepY = bindModifier(
      input('number', { step: '1' }),
      (layer) => layer.modifiers[index].stepY,
      (value) => ({ stepY: value }),
    );
    const angleStep = bindModifier(
      input('number', { step: '0.001' }),
      (layer) => layer.modifiers[index].angleStep,
      (value) => ({ angleStep: value }),
    );
    const radiusStep = bindModifier(
      input('number', { step: '0.1' }),
      (layer) => layer.modifiers[index].radiusStep,
      (value) => ({ radiusStep: value }),
    );
    /* Angle de l'axe d'un miroir : 90° vertical, 0° horizontal, entre les deux
       les symétries diagonales. */
    const axis = bindModifier(
      input('number', { step: '1' }),
      (layer) => axisAngle(layer.modifiers[index]),
      (value) => ({ axis: value }),
    );
    /* Décochée, la copie ne fait que se déplacer : des carrés droits posés en
       cercle sont un motif aussi légitime que des rayons. */
    const orient = bindModifier(
      input('checkbox'),
      (layer) => orients(layer.modifiers[index]),
      (value) => ({ orient: value }),
      { event: 'change', parse: () => orient.checked },
    );

    /* Cochée, l'étage part du pivot du calque et le garde ensuite pour lui ;
       décochée, il le reprend. */
    const writeCenter = (toCenter) => (layer, value) =>
      store.apply(updateModifier, layer.id, index, { center: toCenter(pivotOf(layer, index), value) });
    const ownPivot = bind(
      input('checkbox'),
      (layer) => Boolean(layer.modifiers[index].center),
      writeCenter((pivot, own) => (own ? pivot : null)),
      modifierOptions({ event: 'change', parse: () => ownPivot.checked }),
    );
    const pivotInput = (axis) =>
      bind(
        input('number', { step: '1' }),
        (layer) => Math.round(pivotOf(layer, index)[axis]),
        writeCenter((pivot, value) => ({ ...pivot, [axis]: value })),
        modifierOptions(),
      );

    const apply = (transition, ...args) => {
      const layer = getActiveLayer(store.get());
      if (layer) store.apply(transition, layer.id, ...args);
    };

    const head = el('div', 'modifier-head');
    head.append(
      type,
      /* L'ordre de la pile change le dessin : un pas puis un miroir donne deux
         rangées face à face, l'inverse une seule rangée doublée. */
      iconButton({
        label: `Monter le modificateur ${rank}`,
        text: '↑',
        focusKey: `up-modifier${index}`,
        disabled: index === 0,
        onClick: () => apply(moveModifier, index, -1),
      }),
      iconButton({
        label: `Descendre le modificateur ${rank}`,
        text: '↓',
        focusKey: `down-modifier${index}`,
        disabled: index === stackSize - 1,
        onClick: () => apply(moveModifier, index, 1),
      }),
      iconButton({
        label: `Supprimer le modificateur ${rank}`,
        text: '×',
        focusKey: `delete-modifier${index}`,
        danger: true,
        onClick: () => apply(removeModifier, index),
      }),
    );

    const stepRow = row(field('Pas X (px)', stepX), field('Pas Y (px)', stepY));
    const spiralRow = row(field('Pas angulaire (rad)', angleStep), field('Croissance (%)', radiusStep));
    const axisField = field("Angle de l'axe (°)", axis);
    const orientField = switchField('Orienter les copies', orient);
    const ownPivotField = switchField('Pivot personnalisé', ownPivot);
    const pivotRow = row(field('Pivot X', pivotInput('x')), field('Pivot Y', pivotInput('y')));

    const root = el('div', 'modifier-block');
    root.append(head, countField, stepRow, spiralRow, axisField, orientField, ownPivotField, pivotRow);

    const sync = (layer) => {
      const modifier = layer.modifiers[index];
      if (!modifier) return;
      for (const { node, read } of blockControls) {
        if (node.type === 'checkbox') node.checked = read(layer);
        else if (document.activeElement !== node) node.value = read(layer);
      }
      /* `none` et les miroirs décident eux-mêmes de leur nombre de copies : leur
         proposer un « Copies » promettrait un réglage sans effet. */
      countField.hidden = Object.hasOwn(FIXED_COPIES, modifier.type);
      stepRow.hidden = modifier.type !== 'step';
      spiralRow.hidden = modifier.type !== 'spiral';
      axisField.hidden = !Object.hasOwn(MIRROR_AXIS, modifier.type);
      /* Un pas ne tourne rien : rien à orienter. */
      orientField.hidden = !ORIENTING.has(modifier.type);
      ownPivotField.hidden = !PIVOTING.has(modifier.type);
      pivotRow.hidden = ownPivotField.hidden || !modifier.center;
    };

    return { root, sync };
  };

  const rebuildModifiers = (stack) =>
    rebuildWithFocus(modifierHost, () => {
      blocks = stack.map((_, index) => modifierBlock(index, stack.length));
      modifierHost.append(...blocks.map((block) => block.root));
      return addModifierButton;
    });

  /* ---- Interpolations ---- */

  /* Même calque, même panneau : la rampe d'une interpolation se lie à un étage
     de la pile voisine. */
  const interpolations = interpolationSection({ store });

  /* Un `fieldset` pour tout désactiver d'un coup quand il n'y a plus de calque. */
  const layerDetail = el('fieldset', 'inspector-body');
  layerDetail.dataset.kind = 'layer';
  layerDetail.setAttribute('aria-label', 'Réglages du calque');
  layerDetail.append(
    layerHead.head,
    separator(),
    evenOddField,
    separator(),
    modifierSet,
    separator(),
    interpolations.root,
    separator(),
    planeSet,
  );

  container?.append(layerDetail, shapeDetail);

  /* ---- Synchronisation ---- */

  const sync = (scene) => {
    const layer = getActiveLayer(scene);
    const element = getActiveElement(scene);
    const subjects = { layer, element };

    /* Une forme sélectionnée prend tout le panneau ; sinon, son calque. */
    layerDetail.hidden = Boolean(element);
    shapeDetail.hidden = !element;
    layerDetail.disabled = !layer;
    layerDetail.setAttribute('aria-disabled', String(!layer));

    layerHead.title.textContent = layer?.name ?? 'Aucun calque';
    const owner = element && scene.layers.find((candidate) => candidate.elements.includes(element));
    shapeHead.title.textContent = owner ? shapeName(owner, element, SHAPES) : '';

    for (const { node, read, subject, sync: custom } of controls) {
      const target = subjects[subject];
      if (!target) continue;
      if (custom) {
        custom(target);
        continue;
      }
      const value = read(target);
      if (node.type === 'checkbox') node.checked = Boolean(value);
      else if (document.activeElement !== node) node.value = value;
    }

    if (element) {
      const { geometry, uniform, signed } = SHAPES[element.type];
      /* Un point n'a ni taille ni remplissage : son épaisseur lui donne
         son diamètre, et c'est déjà un bout rond sans longueur à découper. */
      const dot = geometry === 'dot';
      /* Un tracé se dimensionne par ses sommets, pas par des champs. */
      const trace = geometry === 'polyline';
      radiusField.hidden = !uniform || dot || trace;
      widthField.hidden = uniform || trace;
      heightField.hidden = uniform || trace;
      filledField.hidden = dot;
      strokeGroup.hidden = dot;
      strokeSeparator.hidden = dot;
      dashLength.hidden = dashKind(element.dash) !== 'dashed';
      dashPairRow.hidden = dashLength.hidden;
      gapField.hidden = !element.outlined;
      /* Un point tourné reste identique : rien à régler. */
      rotationField.hidden = dot;
      polygonRow.hidden = geometry !== 'polygon';
      arcRow.hidden = geometry !== 'arc';
      closedField.hidden = !trace;
      /* ponytail: une forme à booléens ne s'extrude pas (voir `createExtrusion`). */
      depthField.hidden = !activePlane(owner) || element.booleans.length > 0;
      booleans.sync(owner, element);
      const [widthLabel, heightLabel] = spanLabels[signed ? 'signed' : 'default'];
      widthField.querySelector('label').textContent = widthLabel;
      heightField.querySelector('label').textContent = heightLabel;
    }

    /* Seule la longueur de la pile impose une reconstruction : un changement de
       type ne fait que masquer ou montrer des champs du bloc concerné. */
    const stack = layer?.modifiers ?? [];
    if (stack.length !== blocks.length) rebuildModifiers(stack);
    addModifierButton.disabled = !layer;
    planeSettings.hidden = !activePlane(layer);
    layerPivot.hidden = !stack.some((modifier) => PIVOTING.has(modifier.type));
    const total = copyCount(stack);
    const over = total > MAX_COPIES;
    copyTotal.hidden = stack.length === 0;
    copyTotal.dataset.tone = over ? 'error' : 'info';
    copyTotal.textContent = over
      ? `${total.toLocaleString('fr-FR')} copies — rendu suspendu au-delà de ${MAX_COPIES.toLocaleString('fr-FR')}`
      : `${total} copie${total > 1 ? 's' : ''}`;
    if (layer) for (const block of blocks) block.sync(layer);
    interpolations.sync(layer);
  };

  store.subscribe(sync);
  sync(store.get());
  return { layerDetail, shapeDetail };
};
