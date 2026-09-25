import {
  activePlane,
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
  DASH_PRESETS,
  DEFAULT_PLANE,
  LINECAPS,
  MAX_TILT,
  PLANE_SIDES,
  setLayerEvenOdd,
  setLayerPlane,
  SHAPES,
  updateElement,
} from '../scene.js';
import { shapeName } from './list.js';
import { interpolationSection } from './interpolation-section.js';
import { modifierSection } from './modifier-section.js';
import { booleanSection } from './boolean-section.js';
import { insideField } from './inside-field.js';
import { el, field, input, nextId, row, select, separator, slider as sliderOf, switchField } from './fields.js';

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
const DASH_SLIDER = { min: '0.5', max: '16', step: '0.5' };

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
   * forme, le calque actif pour les siens. Le contrôle
   * ne s'écrit pas quand son sujet est absent.
   */
  const bind = (
    node,
    read,
    write,
    { event = 'input', parse = Number, subject = 'element', into = controls } = {},
  ) => {
    node.addEventListener(event, () => {
      /* Champ vidé pour retaper : rien n'est écrit, `Number('')` vaudrait 0. */
      if (node.type === 'number' && node.value === '') return;
      const scene = store.get();
      const target = subject === 'element' ? getActiveElement(scene) : getActiveLayer(scene);
      if (target) write(target, parse(node.value));
    });
    into.push({ node, read, subject });
    return node;
  };

  const slider = (...args) => sliderOf(bind, ...args);

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

  /* ---- Répétitions et itérations ---- */

  /* Piles du calque actif, ou de la forme active : même section, deux
     propriétaires. La forme applique la sienne avant celle du calque. */
  const layerOwner = (scene) => {
    const layer = getActiveLayer(scene);
    return layer && { layer, owner: layer };
  };
  const elementOwner = (scene) => {
    const owner = getActiveElement(scene);
    const layer = owner && scene.layers.find((candidate) => candidate.elements.includes(owner));
    return layer ? { layer, owner } : null;
  };
  const modifierSet = modifierSection({ store, ownerOf: layerOwner });
  const elementModifierSet = modifierSection({ store, ownerOf: elementOwner, forElement: true });
  /* La rampe d'une interpolation se lie à un étage de la pile voisine. */
  const interpolations = interpolationSection({ store, ownerOf: (scene) => getActiveLayer(scene) });
  const elementInterpolations = interpolationSection({
    store,
    ownerOf: (scene) => elementOwner(scene)?.owner ?? null,
    key: '-element',
  });

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
  const inside = insideField({ store });

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
    elementModifierSet.root,
    separator(),
    elementInterpolations.root,
    separator(),
    booleans.root,
    inside.root,
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

  /* Un `fieldset` pour tout désactiver d'un coup quand il n'y a plus de calque. */
  const layerDetail = el('fieldset', 'inspector-body');
  layerDetail.dataset.kind = 'layer';
  layerDetail.setAttribute('aria-label', 'Réglages du calque');
  layerDetail.append(
    layerHead.head,
    separator(),
    evenOddField,
    separator(),
    modifierSet.root,
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
      /* Relié, le point devient des lignes : il en prend le style de trait. */
      strokeGroup.hidden = dot && !element.modifiers.some((modifier) => modifier.linear && modifier.type !== 'none');
      strokeSeparator.hidden = strokeGroup.hidden;
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
      inside.sync(owner, element);
      const [widthLabel, heightLabel] = spanLabels[signed ? 'signed' : 'default'];
      widthField.querySelector('label').textContent = widthLabel;
      heightField.querySelector('label').textContent = heightLabel;
    }

    modifierSet.sync(scene);
    elementModifierSet.sync(scene);
    planeSettings.hidden = !activePlane(layer);
    interpolations.sync(layer);
    if (element) elementInterpolations.sync(element);
  };

  store.subscribe(sync);
  sync(store.get());
  return { layerDetail, shapeDetail };
};
