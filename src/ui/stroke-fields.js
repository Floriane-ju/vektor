import { clampDash, clampGap, clampLinecap, DASH_PRESETS, getActiveElement, LINECAPS, SHAPES, updateElement } from '../scene.js';
import { el, field, input, row, segmented, switchField } from './fields.js';

/* Bornes du curseur de tirets. Le champ numérique voisin accepte au-delà : le
   curseur couvre l'usage courant sans plafonner le modèle. */
const DASH_SLIDER = { min: '0.5', max: '16', step: '0.5' };

/* Le type de motif se lit sur le tableau de tirets — vide, plein ; un premier
   tiret nul, des points ; sinon des tirets, réglés par tiret et espace. */
const dashKind = (dash) => (dash.length === 0 ? 'solid' : dash[0] === 0 ? 'dotted' : 'dashed');

/* Motif tiret/espace, valeurs en multiples de l'épaisseur de la forme. */
const dashFields = (store, bind, slider) => {
  const length = slider(
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
  /* Un motif plus long (import) perd ses valeurs au-delà de la deuxième dès
     qu'on touche l'un des deux champs. */
  const part = (index) =>
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
  const pairRow = row(field('Tiret (× ép.)', part(0)), field('Espace (× ép.)', part(1)));
  const sync = (element) => {
    length.hidden = dashKind(element.dash) !== 'dashed';
    pairRow.hidden = length.hidden;
  };
  return { nodes: [length, pairRow], sync };
};

/**
 * Remplissage et style du trait de la forme active : motif, bout, contour
 * double. Couleur et épaisseur sont sur la carte du trait (`stroke-card.js`).
 */
export const strokeFields = ({ store, bind, slider }) => {
  const patch = (values) => {
    const element = getActiveElement(store.get());
    if (element) store.apply(updateElement, element.id, values);
  };
  const toggle = (key) =>
    bind(input('checkbox'), (element) => element[key], (element, value) => store.apply(updateElement, element.id, { [key]: value }), {
      event: 'change',
    });
  /* Le remplissage n'a pas de teinte propre : il reprend la couleur de la forme. */
  const filledField = switchField('Remplir', toggle('filled'));

  const kind = segmented(
    'Trait',
    Object.entries(DASH_PRESETS).map(([value, { label }]) => [value, label]),
    (value) => {
      const { label, ...preset } = DASH_PRESETS[value];
      patch(preset);
    },
  );
  const dash = dashFields(store, bind, slider);
  const linecap = segmented('Bout', Object.entries(LINECAPS), (value) => patch({ linecap: clampLinecap(value) }));
  /* Écart vide entre les deux traits, en unités du dessin comme l'épaisseur. */
  const gapField = field(
    'Séparateur',
    bind(
      input('number', { min: '0', max: '100', step: '0.5' }),
      (element) => element.gap,
      (element, value) => store.apply(updateElement, element.id, { gap: clampGap(value) }),
    ),
  );
  const group = el('div', 'group');
  group.append(kind.root, ...dash.nodes, linecap.root, switchField('Contour double', toggle('outlined')), gapField);

  const sync = (element) => {
    const dot = SHAPES[element.type].geometry === 'dot';
    /* Un point n'a pas de remplissage ; relié, il devient des lignes et en
       prend le style de trait. */
    filledField.hidden = dot;
    group.hidden = dot && !element.modifiers.some((modifier) => modifier.linear && modifier.type !== 'none');
    kind.check(dashKind(element.dash));
    linecap.check(element.linecap);
    dash.sync(element);
    gapField.hidden = !element.outlined;
  };
  return { nodes: [filledField, group], sync };
};
