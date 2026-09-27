import { describe, expect, it } from 'vitest';
import { clampCount, CURVES, lerpColor, ramp as curveRamp, stackValues, t } from '../src/interpolate.js';
import { copyCount, createModifier, MAX_COPIES, MODIFIERS, orients } from '../src/modifiers.js';
import {
  addBoolean,
  isClosedShape,
  updateModifier,
  closesLoop,
  currentStyle,
  mixedStyle,
  setStyle,
  addElement,
  addInterpolation,
  addModifier,
  clearInterpolations,
  createElement,
  createInterpolation,
  createLayer,
  dragPatch,
  duplicateElement,
  duplicateElements,
  duplicateLayer,
  removeElements,
  selectedIds,
  selectElements,
  toggleSelected,
  translateElements,
  getRenderedChildren,
  isSuspended,
  copyTotal,
  moveElement,
  moveLayer,
  moveModifier,
  placeElement,
  placeLayer,
  recenterTrace,
  removeBoolean,
  removeElement,
  removeInterpolation,
  removeLayer,
  removeModifier,
  rotateVector,
  pivotOf,
  setLayerCenter,
  setLayerEvenOdd,
  snapToGrid,
  snapToPolarGrid,
  updateBoolean,
  updateElement,
  updateInterpolation,
  updateInterpolationRange,
} from '../src/scene.js';
import { deserialize, FORMAT, serialize } from '../src/persistence.js';
import { createStore, HISTORY_LIMIT } from '../src/store.js';
import { parseTrace } from '../src/path.js';
import { MAX_POINTS, RANGE_BOUNDS, SHAPES } from '../src/scene.js';

const SHAPES_DEFAULT_POINTS = SHAPES.polyline.defaults.points;
import { addLayer, createScene, setActiveElement } from '../src/scene.js';

const center = { x: 0, y: 0 };
const dist = (p) => Math.hypot(p.x - center.x, p.y - center.y);
const angle = (p) => Math.atan2(p.y - center.y, p.x - center.x);

/** Les `n` copies produites par un modificateur pour un point donné. */
const copies = (type, point, n, options = {}) =>
  Array.from({ length: n }, (_, i) => MODIFIERS[type](point, i, n, center, options));

const ramp = (property, range) => createInterpolation({ property, range });

describe('interpolation', () => {
  it('répartit une plage linéairement sur les indices', () => {
    const values = [0, 1, 2, 3, 4].map(
      (i) => stackValues([ramp('opacity', [1, 0])], () => t(i, 5)).opacity,
    );
    expect(values).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it('interpole plusieurs propriétés en une passe', () => {
    expect(
      stackValues([ramp('opacity', [1, 0]), ramp('scale', [1, 2])], () => t(1, 3)),
    ).toEqual({ opacity: 0.5, scale: 1.5 });
  });

  /* Chaque interpolation tire son facteur de sa propre rampe : c'est ce qui
     permet de lier l'opacité à un étage de la pile et l'échelle au total des
     copies. */
  it('donne à chaque interpolation le facteur de sa rampe', () => {
    const stack = [ramp('opacity', [1, 0]), ramp('scale', [1, 3])];
    expect(
      stackValues(stack, (interpolation) => (interpolation.property === 'opacity' ? 0.5 : 1)),
    ).toEqual({ opacity: 0.5, scale: 3 });
  });

  /* Deux interpolations d'une même propriété se superposent comme deux filtres :
     elles se multiplient au lieu de s'écraser. */
  it('compose deux interpolations d’une même propriété par produit', () => {
    const stack = [ramp('opacity', [1, 0.5]), ramp('opacity', [1, 0.5])];
    expect(stackValues(stack, () => 1).opacity).toBeCloseTo(0.25);
    expect(stackValues(stack, () => 0).opacity).toBeCloseTo(1);
  });

  it('une pile vide ne touche à aucune propriété', () => {
    expect(stackValues([], () => 1)).toEqual({});
  });

  it('garde le cas dégénéré sans NaN', () => {
    expect(t(0, 1)).toBe(0);
    expect(t(0, 0)).toBe(0);
    expect(stackValues([ramp('opacity', [1, 0])], () => t(0, 1)).opacity).toBe(1);
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-3)).toBe(1);
    expect(clampCount(2.7)).toBe(2);
  });
});

describe('modificateurs', () => {
  it('axial rend N copies régulièrement réparties à distance constante', () => {
    const children = copies('axial', { x: 100, y: 0 }, 6);
    expect(children).toHaveLength(6);
    for (const child of children) expect(dist(child)).toBeCloseTo(100);
    for (let i = 1; i < children.length; i += 1) {
      const delta = angle(children[i]) - angle(children[i - 1]);
      expect(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)))).toBeCloseTo(Math.PI / 3);
    }
  });

  it('mirrorH rend l’original et son reflet', () => {
    const [original, reflected] = copies('mirrorH', { x: 30, y: 7 }, 2);
    expect(original.x).toBeCloseTo(30);
    expect(reflected.x).toBeCloseTo(-30);
    expect(reflected.y).toBeCloseTo(7);
  });

  it('mirrorV agit sur y et laisse x intact', () => {
    const children = copies('mirrorV', { x: 9, y: 100 }, 2);
    expect(children.map((c) => c.y)).toEqual([100, -100]);
    expect(children.every((c) => c.x === 9)).toBe(true);
  });

  it('miroir d’axe libre : 90° et 0° redonnent mirrorH et mirrorV, 45° échange x et y', () => {
    const point = { x: 30, y: 7 };
    expect(copies('mirrorH', point, 2, { axis: 90 })).toEqual(copies('mirrorH', point, 2));
    expect(copies('mirrorV', point, 2, { axis: 0 })).toEqual(copies('mirrorV', point, 2));
    expect(copies('mirrorH', point, 2, { axis: 0 })).toEqual(copies('mirrorV', point, 2));
    const [, diagonal] = copies('mirrorV', point, 2, { axis: 45 });
    expect(diagonal.x).toBeCloseTo(7);
    expect(diagonal.y).toBeCloseTo(30);
    expect(diagonal.flip).toBe(true);
    expect(diagonal.angle).toBeCloseTo(Math.PI * 1.5);
  });

  it('l’angle d’axe se borne à [0, 180), tombe au changement de type, survit à la sauvegarde', () => {
    const layer = createLayer({ modifiers: [createModifier({ type: 'mirrorH' })] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const tilted = updateModifier(scene, layer.id, 0, { axis: 225 });
    expect(tilted.layers[0].modifiers[0].axis).toBe(45);
    expect(deserialize(serialize(tilted)).layers[0].modifiers[0].axis).toBe(45);
    expect(updateModifier(tilted, layer.id, 0, { type: 'mirrorV' }).layers[0].modifiers[0]).not.toHaveProperty('axis');
    const raw = JSON.parse(serialize(tilted));
    raw.layers[0].modifiers[0].axis = 'nope';
    expect(deserialize(JSON.stringify(raw)).layers[0].modifiers[0]).not.toHaveProperty('axis');
  });

  it('step translate chaque copie d’un pas constant', () => {
    const children = copies('step', { x: 10, y: 5 }, 4, { stepX: 30, stepY: -20 });
    expect(children.map((c) => c.x)).toEqual([10, 40, 70, 100]);
    expect(children.map((c) => c.y)).toEqual([5, -15, -35, -55]);
  });

  /* Un modificateur déplace le calque entier : deux formes gardent leur écart
     d'une copie à l'autre, quelle que soit leur distance au centre. */
  it('les miroirs et le pas sont des isométries', () => {
    const near = { x: 20, y: 12 };
    const far = { x: 300, y: -140 };
    const gap = Math.hypot(far.x - near.x, far.y - near.y);

    for (const [type, options] of [
      ['mirrorH', {}],
      ['mirrorV', {}],
      ['step', { stepX: 40, stepY: 25 }],
      ['axial', {}],
    ]) {
      const n = 4;
      const a = copies(type, near, n, options);
      const b = copies(type, far, n, options);
      for (let i = 0; i < a.length; i += 1) {
        expect(Math.hypot(b[i].x - a[i].x, b[i].y - a[i].y)).toBeCloseTo(gap);
      }
    }
  });

  it('spiral : croissance bornée, jamais de coordonnée non finie', () => {
    const far = copies('spiral', { x: 10, y: 0 }, MAX_COPIES, { angleStep: 0.1, radiusStep: 1e9 });
    expect(far.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const shrink = copies('spiral', { x: 10, y: 0 }, 3, { angleStep: 0, radiusStep: -500 });
    expect(shrink.every(({ x }) => x > 0)).toBe(true);
  });

  it('spiral tourne et dilate d’un facteur constant', () => {
    const children = copies('spiral', { x: 10, y: 0 }, 4, {
      angleStep: Math.PI / 2,
      radiusStep: 50,
    });
    expect(children.map(dist)).toEqual([10, 15, 22.5, 33.75].map((d) => expect.closeTo(d)));
    expect(children[1].x).toBeCloseTo(0);
    expect(children[1].y).toBeCloseTo(15);
  });

  /* Même courbe, mais parcourue à pas d'arc constant : longueur mesurée en
     suivant la transformation à indice fractionnaire, comme le tracé lissé. */
  it('spiral à espacement constant : copies équidistantes le long de la courbe', () => {
    const options = { angleStep: 0.8, radiusStep: 40, evenSpacing: true };
    const at = (i) => MODIFIERS.spiral({ x: 10, y: 0 }, i, 6, center, options);
    const arc = (from) => {
      let length = 0;
      for (let s = 1; s <= 400; s += 1) {
        const a = at(from + (s - 1) / 400);
        const b = at(from + s / 400);
        length += Math.hypot(b.x - a.x, b.y - a.y);
      }
      return length;
    };
    const first = arc(0);
    for (const i of [1, 2, 3, 4]) expect(arc(i)).toBeCloseTo(first, 1);
    /* Première copie identique à la spirale croissante. */
    const growing = MODIFIERS.spiral({ x: 10, y: 0 }, 1, 6, center, { ...options, evenSpacing: false });
    expect(at(1).x).toBeCloseTo(growing.x);
    expect(at(1).y).toBeCloseTo(growing.y);
    /* Sans croissance : un cercle, pas angulaire inchangé. */
    const circle = MODIFIERS.spiral({ x: 10, y: 0 }, 3, 6, center, { angleStep: 0.5, radiusStep: 0, evenSpacing: true });
    expect(circle.angle).toBeCloseTo(1.5);
    /* Qui rétrécit : s'arrête au centre, jamais de valeur non finie. */
    const shrink = copies('spiral', { x: 10, y: 0 }, 12, { angleStep: 0.4, radiusStep: -30, evenSpacing: true });
    expect(shrink.every(({ x, y, angle: a }) => [x, y, a].every(Number.isFinite))).toBe(true);
  });

  it('archimedes : rayon linéaire en angle', () => {
    const children = copies('archimedes', { x: 10, y: 0 }, 4, { angleStep: Math.PI / 2, radiusStep: 50 });
    expect(children.map(dist)).toEqual([10, 15, 20, 25].map((d) => expect.closeTo(d)));
    expect(children[1].y).toBeCloseTo(15);
    const shrink = copies('archimedes', { x: 10, y: 0 }, 6, { angleStep: 0.4, radiusStep: -40 });
    expect(shrink.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('archimedes à espacement constant : copies équidistantes le long de la courbe', () => {
    for (const radiusStep of [40, -5]) {
      const options = { angleStep: 0.8, radiusStep, evenSpacing: true };
      const at = (i) => MODIFIERS.archimedes({ x: 10, y: 0 }, i, 6, center, options);
      const arc = (from) => {
        let length = 0;
        for (let s = 1; s <= 400; s += 1) {
          const a = at(from + (s - 1) / 400);
          const b = at(from + s / 400);
          length += Math.hypot(b.x - a.x, b.y - a.y);
        }
        return length;
      };
      const first = arc(0);
      for (const i of [1, 2, 3, 4]) expect(arc(i)).toBeCloseTo(first, 1);
      /* Même courbe : rayon toujours linéaire en angle. */
      const { x, y, angle } = at(3);
      expect(Math.hypot(x - center.x, y - center.y)).toBeCloseTo(10 * (1 + (angle / 0.8) * (radiusStep / 100)));
    }
  });

  /* Une similitude, pas un étirement : deux formes du calque gardent leurs
     proportions d'une copie à l'autre, l'écart suivant le même facteur. */
  it('spiral grandit le motif sans le déformer', () => {
    const near = { x: 20, y: 12 };
    const far = { x: 300, y: -140 };
    const gap = Math.hypot(far.x - near.x, far.y - near.y);
    const options = { angleStep: 0.4, radiusStep: 12 };
    const a = copies('spiral', near, 5, options);
    const b = copies('spiral', far, 5, options);
    for (let i = 0; i < a.length; i += 1) {
      expect(Math.hypot(b[i].x - a[i].x, b[i].y - a[i].y)).toBeCloseTo(gap * 1.12 ** i);
    }
  });

  it('N=1 ne rend qu’une copie, à la position de départ', () => {
    for (const type of ['step', 'axial', 'spiral']) {
      const [only, ...rest] = copies(type, { x: 40, y: 20 }, 1);
      expect(rest).toHaveLength(0);
      expect(only.x).toBeCloseTo(40);
      expect(only.y).toBeCloseTo(20);
    }
  });
});

describe('composition', () => {
  const layer = (overrides = {}) =>
    createLayer({
      center,
      elements: [createElement('ellipse', 100, 0)],
      modifiers: [{ type: 'step', n: 5, stepX: -50, stepY: 0, angleStep: 0.4, radiusStep: 12 }],
      ...overrides,
    });

  const fade = (overrides = {}) =>
    createInterpolation({ property: 'opacity', range: [1, 0], ...overrides });

  it('applique position puis propriétés interpolées en une passe', () => {
    const children = getRenderedChildren(layer({ interpolations: [fade()] }));
    expect(children.map((c) => c.x)).toEqual([100, 50, 0, -50, -100]);
    expect(children.map((c) => c.y)).toEqual([0, 0, 0, 0, 0]);
    expect(children.map((c) => c.opacity)).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  /* Une pile vide ne pose aucune propriété : le renderer retombe sur ses
     valeurs neutres plutôt que sur une opacité écrite partout. */
  it('sans interpolation, toutes les copies se rendent pareilles', () => {
    const children = getRenderedChildren(layer());
    expect(children.map((c) => c.opacity)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  /* La pile appartient au calque : celle d'un voisin ne le touche pas. */
  it('la pile d’un calque ne dépasse pas sur un autre', () => {
    const faded = layer({ interpolations: [fade()] });
    const plain = layer();
    expect(getRenderedChildren(faded).map((c) => c.opacity)).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(getRenderedChildren(plain).every((child) => child.opacity === undefined)).toBe(true);
  });

  /* La rotation s'additionne à l'angle propre de chaque copie : 0 → 180° sur
     10 copies donne un pas régulier de 20°. */
  it('une interpolation de rotation vrille le motif régulièrement', () => {
    const twisted = layer({
      modifiers: [{ type: 'step', n: 10, stepX: 0, stepY: 0 }],
      elements: [createElement('ellipse', 100, 0, { rotation: 10 })],
      interpolations: [createInterpolation({ property: 'rotation', range: [0, 180] })],
    });
    const angles = getRenderedChildren(twisted).map((c) => c.rotation);
    angles.forEach((angle, i) => expect(angle).toBeCloseTo(10 + i * 20));
  });

  /* Deux rotations empilées s'additionnent (neutre 0) : un produit mettrait
     toutes les copies à 0° dès qu'une des deux part de 0. */
  it('deux interpolations de rotation se composent par somme', () => {
    const twisted = layer({
      interpolations: [
        createInterpolation({ property: 'rotation', range: [0, 40] }),
        createInterpolation({ property: 'rotation', range: [0, 40] }),
      ],
    });
    const angles = getRenderedChildren(twisted).map((c) => c.rotation);
    angles.forEach((angle, i) => expect(angle).toBeCloseTo(i * 20));
  });

  /* L'épaisseur est un facteur de celle de la forme, comme l'échelle l'est de
     la taille : 4 → 0,5 va de 4× à la moitié de l'épaisseur de la forme. */
  it('une interpolation d’épaisseur affine les copies', () => {
    const thinning = layer({
      elements: [createElement('ellipse', 100, 0, { strokeWidth: 2 })],
      interpolations: [createInterpolation({ property: 'strokeWidth', range: [4, 0.5] })],
    });
    const widths = getRenderedChildren(thinning).map((c) => c.strokeWidth);
    expect(widths[0]).toBeCloseTo(8);
    expect(widths[4]).toBeCloseTo(1);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
  });

  it('un calque sans forme ne rend rien', () => {
    expect(getRenderedChildren(createLayer())).toEqual([]);
  });

  it('`none` ignore N et ne rend que les formes du calque', () => {
    const single = layer({ modifiers: [{ type: 'none', n: 9, angleStep: 0, radiusStep: 0 }] });
    expect(getRenderedChildren(single)).toHaveLength(1);
  });

  it('un miroir rend deux copies, quel que soit N', () => {
    const mirrored = layer({
      modifiers: [{ type: 'mirrorH', n: 9, stepX: 0, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    expect(getRenderedChildren(mirrored).map((c) => c.x)).toEqual([100, -100]);
  });

  /* Le cœur du modèle : le modificateur déplace le calque entier, pas chaque
     forme séparément. */
  it('le modificateur transforme le groupe, pas chaque forme isolément', () => {
    const group = layer({
      elements: [createElement('ellipse', 100, 0), createElement('point', 140, 0)],
      modifiers: [{ type: 'axial', n: 4, angleStep: 0, radiusStep: 0 }],
    });
    const children = getRenderedChildren({ ...group, interpolations: [fade()] });

    expect(children).toHaveLength(8);
    /* Les deux formes d'une même copie partagent l'opacité de cet indice… */
    const expected = [1, 1, 2 / 3, 2 / 3, 1 / 3, 1 / 3, 0, 0];
    children.forEach((child, i) => expect(child.opacity).toBeCloseTo(expected[i]));
    /* …et gardent leur écart d'origine après rotation : le motif tourne entier. */
    for (let i = 0; i < 8; i += 2) {
      expect(Math.hypot(children[i + 1].x - children[i].x, children[i + 1].y - children[i].y))
        .toBeCloseTo(40);
    }
  });

  /* Empiler multiplie : c'est ce qui distingue une pile d'une simple liste de
     gestes juxtaposés. */
  it('empile deux modificateurs : les copies se multiplient', () => {
    const stacked = layer({
      modifiers: [
        { type: 'step', n: 3, stepX: 10, stepY: 0 },
        { type: 'mirrorH', n: 9 },
      ],
    });
    const children = getRenderedChildren(stacked);
    expect(children.map((c) => c.x)).toEqual([100, -100, 110, -110, 120, -120]);
  });

  it('l’ordre de la pile change le dessin', () => {
    const mirrorFirst = layer({
      modifiers: [
        { type: 'mirrorH', n: 9 },
        { type: 'step', n: 3, stepX: 10, stepY: 0 },
      ],
    });
    /* Le miroir passe avant le pas : la rangée reflétée avance dans le même
       sens que l'originale, au lieu de lui faire face. */
    expect(getRenderedChildren(mirrorFirst).map((c) => c.x)).toEqual([
      100, 110, 120, -100, -90, -80,
    ]);
  });

  const twoStages = (interpolations = []) =>
    layer({
      modifiers: [
        { type: 'step', n: 3, stepX: 10, stepY: 0 },
        { type: 'mirrorH', n: 2 },
      ],
      interpolations,
    });

  it('la rampe d’interpolation court sur le total des copies empilées', () => {
    const opacities = getRenderedChildren(twoStages([fade()])).map((c) => c.opacity);
    [1, 0.8, 0.6, 0.4, 0.2, 0].forEach((expected, i) =>
      expect(opacities[i]).toBeCloseTo(expected),
    );
  });

  /* Liée à un étage, la rampe ne voit que l'indice de cet étage : le miroir
     éteint la copie reflétée, et le pas ne change rien à l'opacité. */
  it('une interpolation liée à un modificateur suit le seul indice de cet étage', () => {
    const stacked = twoStages([fade({ binding: 1 })]);
    expect(getRenderedChildren(stacked).map((c) => c.opacity)).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it('deux interpolations suivent chacune leur rampe', () => {
    const children = getRenderedChildren(
      twoStages([fade({ binding: 0 }), createInterpolation({ property: 'scale', range: [1, 3] })]),
    );
    expect(children.map((c) => c.opacity)).toEqual([1, 1, 0.5, 0.5, 0, 0]);
    children.map((c) => c.scale).forEach((scale, i) => expect(scale).toBeCloseTo(1 + 0.4 * i));
  });

  /* Deux interpolations d'une même propriété se composent au lieu de s'écraser :
     c'est ce que veut dire « empiler » ici. */
  it('empile deux interpolations d’une même propriété', () => {
    const opacities = getRenderedChildren(
      twoStages([fade({ binding: 1 }), fade({ range: [1, 0.5] })]),
    ).map((c) => c.opacity);
    [1, 0, 0.8, 0, 0.6, 0].forEach((expected, i) => expect(opacities[i]).toBeCloseTo(expected));
  });

  it('une liaison qui ne désigne plus d’étage retombe sur la rampe globale', () => {
    const orphan = layer({ interpolations: [fade({ binding: 4 })] });
    expect(getRenderedChildren(orphan).map((c) => c.opacity)).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it('une pile vide rend le calque tel quel', () => {
    const bare = layer({ modifiers: [] });
    const children = getRenderedChildren(bare);
    expect(children).toHaveLength(1);
    expect([children[0].x, children[0].y]).toEqual([100, 0]);
  });

  it('rend n × formes, groupées par copie', () => {
    const group = layer({
      elements: [createElement('ellipse', 10, 0), createElement('rect', 20, 0)],
      modifiers: [{ type: 'step', n: 3, stepX: 10, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    expect(getRenderedChildren(group).map((c) => c.type)).toEqual([
      'ellipse',
      'rect',
      'ellipse',
      'rect',
      'ellipse',
      'rect',
    ]);
  });
});

describe('scène immuable', () => {
  it('moveLayer ne touche pas la scène d’origine', () => {
    const a = createLayer();
    const b = createLayer();
    const scene = { layers: [a, b], activeLayerId: a.id, activeElementId: null };
    const next = moveLayer(scene, a.id, 1);
    expect(scene.layers).toEqual([a, b]);
    expect(next.layers).toEqual([b, a]);
  });

  it('placeLayer pose un calque à un rang donné, bornes comprises', () => {
    const [a, b, c] = [createLayer(), createLayer(), createLayer()];
    const scene = { layers: [a, b, c], activeLayerId: a.id, activeElementId: null };
    expect(placeLayer(scene, a.id, 2).layers).toEqual([b, c, a]);
    expect(placeLayer(scene, c.id, 0).layers).toEqual([c, a, b]);
    expect(placeLayer(scene, b.id, 99).layers).toEqual([a, c, b]);
    expect(scene.layers).toEqual([a, b, c]);
    expect(placeLayer(scene, a.id, 0)).toBe(scene);
    expect(placeLayer(scene, 'inconnu', 1)).toBe(scene);
  });

  it('placeElement réordonne dans le calque', () => {
    const [e1, e2, e3] = ['rect', 'ellipse', 'line'].map((type) => createElement(type, 0, 0));
    const layer = createLayer({ elements: [e1, e2, e3] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(placeElement(scene, e1.id, layer.id, 2).layers[0].elements).toEqual([e2, e3, e1]);
    expect(placeElement(scene, e3.id, layer.id, 0).layers[0].elements).toEqual([e3, e1, e2]);
    expect(placeElement(scene, e2.id, layer.id, 1)).toBe(scene);
  });

  it('placeElement change une forme de calque et rompt ses booléens', () => {
    const [shape, tool, user] = ['rect', 'ellipse', 'line'].map((type) => createElement(type, 0, 0));
    const from = createLayer({
      elements: [
        { ...shape, booleans: [{ with: tool.id, op: 'subtract' }] },
        tool,
        { ...user, booleans: [{ with: shape.id, op: 'union' }] },
      ],
    });
    const to = createLayer({ elements: [createElement('rect', 0, 0)] });
    const scene = { layers: [from, to], activeLayerId: from.id, activeElementId: shape.id };
    const next = placeElement(scene, shape.id, to.id, 1);

    expect(next.layers[0].elements.map((el) => el.id)).toEqual([tool.id, user.id]);
    /* La forme qui l'employait comme outil le perd. */
    expect(next.layers[0].elements[1].booleans).toEqual([]);
    const moved = next.layers[1].elements[1];
    expect(moved.id).toBe(shape.id);
    expect(moved.booleans).toEqual([]);
    /* La forme active suit : son calque devient l'actif. */
    expect(next.activeLayerId).toBe(to.id);
    expect(next.activeElementId).toBe(shape.id);
    expect(scene.layers[0].elements).toHaveLength(3);
  });

  it('un déplacement hors bornes rend la même référence', () => {
    const a = createLayer();
    const scene = { layers: [a], activeLayerId: a.id, activeElementId: null };
    expect(moveLayer(scene, a.id, 1)).toBe(scene);
    expect(moveElement(scene, 'inconnu', 1)).toBe(scene);
  });
});

/* Une liaison désigne un rang dans la pile de modificateurs du calque : remuer
   la pile doit l'emmener, sinon l'opacité sauterait d'un étage à l'autre. */
describe('pile d’interpolations', () => {
  const scene = () => {
    const layer = createLayer({
      modifiers: [{ type: 'step' }, { type: 'axial' }, { type: 'mirrorH' }],
      interpolations: [
        createInterpolation({ property: 'opacity', binding: 2 }),
        createInterpolation({ property: 'scale', binding: 0 }),
      ],
    });
    return { layers: [layer], activeLayerId: layer.id, activeElementId: null };
  };
  const bindings = (next) =>
    next.layers[0].interpolations.map((interpolation) => interpolation.binding);
  const layerId = (next) => next.layers[0].id;

  it('suit le modificateur déplacé dans la pile', () => {
    const start = scene();
    expect(bindings(moveModifier(start, layerId(start), 2, -1))).toEqual([1, 0]);
  });

  it('retombe sur la rampe globale quand l’étage lié disparaît', () => {
    const start = scene();
    expect(bindings(removeModifier(start, layerId(start), 2))).toEqual([null, 0]);
  });

  it('décale les liaisons des étages suivant celui qu’on supprime', () => {
    const start = scene();
    expect(bindings(removeModifier(start, layerId(start), 0))).toEqual([1, null]);
  });

  it('borne la plage saisie comme l’import : même valeur après rechargement', () => {
    const start = scene();
    const id = start.layers[0].interpolations[0].id;
    const retyped = updateInterpolation(start, layerId(start), id, { property: 'scale' });
    const typed = updateInterpolationRange(retyped, layerId(retyped), id, 0, 9.99);
    expect(typed.layers[0].interpolations[0].range[0]).toBe(RANGE_BOUNDS.scale.max);
    expect(deserialize(serialize(typed)).layers[0].interpolations[0].range).toEqual(typed.layers[0].interpolations[0].range);
  });

  it('changer de propriété repart de la plage par défaut de la nouvelle', () => {
    const start = scene();
    const id = start.layers[0].interpolations[0].id;
    const busy = updateInterpolationRange(start, layerId(start), id, 1, 0.6);
    expect(busy.layers[0].interpolations[0].range).toEqual([1, 0.6]);
    const retyped = updateInterpolation(busy, layerId(busy), id, { property: 'scale' });
    expect(retyped.layers[0].interpolations[0].range).toEqual([1, 0.4]);
  });

  it('ajoute, retire et vide la pile sans muter la scène', () => {
    const start = scene();
    const id = start.layers[0].interpolations[0].id;
    expect(addInterpolation(start, layerId(start)).layers[0].interpolations).toHaveLength(3);
    expect(
      removeInterpolation(start, layerId(start), id).layers[0].interpolations,
    ).toHaveLength(1);
    expect(clearInterpolations(start, layerId(start)).layers[0].interpolations).toEqual([]);
    expect(start.layers[0].interpolations).toHaveLength(2);
  });

  /* La pile part avec son calque : elle n'appartient qu'à lui. */
  it('supprimer un calque emporte sa pile', () => {
    const start = scene();
    expect(removeLayer(start, layerId(start)).layers).toEqual([]);
  });
});

describe('formes d’un calque', () => {
  const withTwo = () => {
    const layer = createLayer();
    let scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    scene = addElement(scene, layer.id, 'ellipse', 10, 10);
    scene = addElement(scene, layer.id, 'ellipse', 20, 20);
    return scene;
  };

  it('ajoute les formes au calque et active la dernière', () => {
    const scene = withTwo();
    expect(scene.layers[0].elements).toHaveLength(2);
    expect(scene.activeElementId).toBe(scene.layers[0].elements[1].id);
  });

  it('une nouvelle forme reprend le remplissage de la forme active', () => {
    let scene = withTwo();
    scene = updateElement(scene, scene.activeElementId, { filled: true });
    scene = addElement(scene, scene.layers[0].id, 'ellipse', 30, 30);
    expect(scene.layers[0].elements.at(-1).filled).toBe(true);
  });

  it('un type différent reprend le remplissage mais sa propre géométrie', () => {
    let scene = withTwo();
    scene = updateElement(scene, scene.activeElementId, { filled: true });
    scene = addElement(scene, scene.layers[0].id, 'point', 30, 30);
    const point = scene.layers[0].elements.at(-1);
    expect(point.filled).toBe(true);
    expect(point.rx).toBe(0);
    expect(point.strokeWidth).toBe(1.5);
    expect(point.stroke).toBe('#7dd3c0');
  });

  it('une nouvelle forme reprend couleur et épaisseur de la dernière créée', () => {
    let scene = withTwo();
    scene = updateElement(scene, scene.activeElementId, { stroke: '#ff0000', strokeWidth: 4 });
    scene = addElement(scene, scene.layers[0].id, 'rect', 30, 30);
    expect(scene.layers[0].elements.at(-1)).toMatchObject({ stroke: '#ff0000', strokeWidth: 4 });
    /* La première forme garde les siennes. */
    expect(scene.layers[0].elements[0]).toMatchObject({ stroke: '#7dd3c0', strokeWidth: 1.5 });
    /* Sans forme active, la dernière du calque sert de modèle. */
    scene = addElement({ ...scene, activeElementId: null }, scene.layers[0].id, 'rect', 40, 40);
    expect(scene.layers[0].elements.at(-1)).toMatchObject({ stroke: '#ff0000', strokeWidth: 4 });
  });

  it('sans forme active, le style courant règle les prochaines formes', () => {
    let scene = { ...withTwo(), activeElementId: null };
    const before = scene.layers;
    scene = setStyle(scene, { stroke: '#123456', strokeWidth: 7 });
    /* Aucune forme touchée : pas d'entrée d'historique. */
    expect(scene.layers).toBe(before);
    expect(currentStyle(scene)).toEqual({ stroke: '#123456', strokeWidth: 7 });
    scene = addElement(scene, scene.layers[0].id, 'rect', 30, 30);
    expect(scene.layers[0].elements.at(-1)).toMatchObject({ stroke: '#123456', strokeWidth: 7 });
    /* Avec une forme active, le réglage la modifie et devient le style courant. */
    scene = setStyle(scene, { strokeWidth: 2 });
    expect(scene.layers[0].elements.at(-1).strokeWidth).toBe(2);
    expect(currentStyle({ ...scene, activeElementId: null })).toEqual({ stroke: '#123456', strokeWidth: 2 });
  });

  it('supprimer la forme active en réactive une autre', () => {
    const scene = withTwo();
    const next = removeElement(scene, scene.activeElementId);
    expect(next.layers[0].elements).toHaveLength(1);
    expect(next.activeElementId).toBe(next.layers[0].elements[0].id);
  });

  it('supprimer le calque lâche la forme active qu’il portait', () => {
    const scene = withTwo();
    const next = removeLayer(scene, scene.layers[0].id);
    expect(next.activeElementId).toBeNull();
  });

  it('moveElement réordonne sans muter', () => {
    const scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    const next = moveElement(scene, first.id, 1);
    expect(scene.layers[0].elements).toEqual([first, second]);
    expect(next.layers[0].elements).toEqual([second, first]);
  });

  it('duplicateElement insère une copie décalée juste devant et la sélectionne', () => {
    const scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    const next = duplicateElement(scene, first.id, 10);
    const copy = next.layers[0].elements[1];
    expect(next.layers[0].elements).toHaveLength(3);
    expect(next.layers[0].elements[2]).toBe(second);
    expect(copy).toEqual({ ...first, id: copy.id, x: first.x + 10, y: first.y + 10 });
    expect(copy.id).not.toBe(first.id);
    expect(next.activeElementId).toBe(copy.id);
    expect(scene.layers[0].elements).toEqual([first, second]);
    expect(duplicateElement(scene, 'inconnu', 10)).toBe(scene);
  });

  it('la sélection vaut la forme active tant qu’aucune autre ne s’y ajoute', () => {
    const scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    expect(selectedIds(scene)).toEqual([second.id]);
    expect(selectedIds(setActiveElement(scene, null))).toEqual([]);
    const both = selectElements(scene, [first.id, second.id]);
    expect(both.layers).toBe(scene.layers);
    expect(selectedIds(setActiveElement(both, first.id))).toEqual([first.id, second.id]);
    /* Une transition qui active une forme hors sélection la ramène à elle seule. */
    expect(selectedIds(addElement(both, scene.layers[0].id, 'rect', 0, 0))).toHaveLength(1);
  });

  it('selectElements reste dans le calque de la dernière forme, qui devient active', () => {
    let scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    scene = addLayer(scene);
    scene = addElement(scene, scene.activeLayerId, 'rect', 0, 0);
    const other = scene.layers[1].elements[0];
    const next = selectElements(scene, [other.id, first.id, second.id]);
    expect(selectedIds(next)).toEqual([first.id, second.id]);
    expect(next.activeElementId).toBe(second.id);
    expect(next.activeLayerId).toBe(scene.layers[0].id);
    expect(selectedIds(selectElements(scene, []))).toEqual([]);
  });

  it('toggleSelected ajoute ou retire une forme du même calque, sinon la sélectionne seule', () => {
    let scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    scene = toggleSelected(scene, first.id);
    expect(selectedIds(scene)).toEqual([second.id, first.id]);
    expect(scene.activeElementId).toBe(first.id);
    scene = toggleSelected(scene, first.id);
    expect(selectedIds(scene)).toEqual([second.id]);
    expect(selectedIds(toggleSelected(scene, second.id))).toEqual([]);
    scene = addLayer(scene);
    scene = addElement(scene, scene.activeLayerId, 'rect', 0, 0);
    const other = scene.layers[1].elements[0];
    const back = toggleSelected(selectElements(scene, [first.id, second.id]), other.id);
    expect(selectedIds(back)).toEqual([other.id]);
  });

  it('setStyle règle toute la sélection ; mixedStyle dit ce qui diffère', () => {
    let scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    scene = updateElement(scene, first.id, { stroke: '#ff0000' });
    scene = selectElements(scene, [first.id, second.id]);
    expect(mixedStyle(scene)).toEqual({ stroke: true, strokeWidth: false });
    scene = setStyle(scene, { stroke: '#00ff00' });
    expect(scene.layers[0].elements.map((el) => el.stroke)).toEqual(['#00ff00', '#00ff00']);
    expect(mixedStyle(scene)).toEqual({ stroke: false, strokeWidth: false });
    scene = setStyle(scene, { strokeWidth: 6 });
    expect(scene.layers[0].elements.map((el) => el.strokeWidth)).toEqual([6, 6]);
    expect(mixedStyle(setActiveElement(scene, null))).toEqual({ stroke: false, strokeWidth: false });
  });

  it('translateElements déplace plusieurs formes en une transition', () => {
    const scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    const next = translateElements(scene, [first.id, second.id], 5, -2);
    expect(next.layers[0].elements.map(({ x, y }) => [x, y])).toEqual([[15, 8], [25, 18]]);
    expect(translateElements(scene, [], 5, 5)).toBe(scene);
  });

  it('removeElements supprime la sélection et lâche les outils qu’elle portait', () => {
    let scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    scene = addElement(scene, scene.layers[0].id, 'rect', 0, 0);
    const third = scene.layers[0].elements[2];
    scene = addBoolean(scene, third.id);
    scene = updateBoolean(scene, third.id, 0, { with: first.id });
    const next = removeElements(selectElements(scene, [first.id, second.id]), [first.id, second.id]);
    expect(next.layers[0].elements.map((el) => el.id)).toEqual([third.id]);
    expect(next.layers[0].elements[0].booleans).toEqual([]);
    expect(selectedIds(next)).toEqual([third.id]);
  });

  it('duplicateElements copie un groupe, ses booléens internes suivent les copies', () => {
    let scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    scene = addBoolean(scene, second.id);
    scene = updateBoolean(scene, second.id, 0, { with: first.id });
    const next = duplicateElements(scene, [first.id, second.id], 10);
    const elements = next.layers[0].elements;
    expect(elements).toHaveLength(4);
    const [, copyA, , copyB] = elements;
    expect(elements[0]).toBe(scene.layers[0].elements[0]);
    expect(copyA).toMatchObject({ x: first.x + 10, y: first.y + 10 });
    expect(copyB.booleans[0].with).toBe(copyA.id);
    expect(selectedIds(next)).toEqual([copyA.id, copyB.id]);
    /* Seule, la copie garde son outil d'origine. */
    const alone = duplicateElement(scene, second.id, 10);
    expect(alone.layers[0].elements.at(-1).booleans[0].with).toBe(first.id);
  });

  it('duplicateLayer recrée le calque juste au-dessus, ids neufs, liaisons et booléens suivis', () => {
    let scene = withTwo();
    const [first, second] = scene.layers[0].elements;
    scene = addBoolean(scene, first.id);
    scene = addModifier(scene, scene.layers[0].id);
    scene = addInterpolation(scene, scene.layers[0].id);
    scene = updateInterpolation(scene, scene.layers[0].id, scene.layers[0].interpolations[0].id, { binding: 0 });
    scene = addLayer(scene);
    scene = setActiveElement(scene, first.id);
    const source = scene.layers[0];

    const next = duplicateLayer(scene, source.id);
    expect(next.layers).toHaveLength(3);
    const copy = next.layers[1];
    expect(next.layers[0]).toBe(source);
    expect(next.activeLayerId).toBe(copy.id);
    expect(next.activeElementId).toBeNull();
    expect(copy.id).not.toBe(source.id);
    expect(copy.modifiers).toEqual(source.modifiers);
    expect(copy.interpolations[0].binding).toBe(0);
    expect(copy.interpolations[0].id).not.toBe(source.interpolations[0].id);
    const [a, b] = copy.elements;
    expect([a.id, b.id]).not.toContain(first.id);
    expect([a.id, b.id]).not.toContain(second.id);
    expect(a.booleans).toEqual([{ with: b.id, op: source.elements[0].booleans[0].op }]);
    expect(a).toEqual({ ...source.elements[0], id: a.id, booleans: a.booleans });
    expect(scene.layers).toHaveLength(2);
    expect(duplicateLayer(scene, 'inconnu')).toBe(scene);
  });
});

describe('persistance', () => {
  it('un aller-retour JSON reconstruit une scène identique', () => {
    const layer = createLayer({
      elements: [
        createElement('ellipse', 120, 340, { rx: 42, ry: 42, filled: true }),
        createElement('rect', 200, 100, { rx: 30, ry: 15 }),
      ],
      modifiers: [
        { type: 'spiral', n: 12, stepX: 25, stepY: -10, angleStep: 0.3, radiusStep: 8 },
        { type: 'mirrorV', n: 2, stepX: 60, stepY: 0, angleStep: 0.4, radiusStep: 12 },
      ],
      interpolations: [
        createInterpolation({ property: 'opacity', range: [1, 0.2], binding: 1 }),
        createInterpolation({ property: 'scale', range: [0.5, 2] }),
      ],
    });
    const scene = {
      layers: [layer],
      activeLayerId: layer.id,
      activeElementId: layer.elements[1].id,
    };
    expect(deserialize(serialize(scene))).toEqual(scene);
  });

  it('un champ nul ou vide se replie sur le défaut, pas sur 0', () => {
    const file = JSON.stringify({
      format: FORMAT,
      layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'rect', x: 0, y: 0, rx: 10, ry: 10, strokeWidth: null }], modifiers: [{ type: 'spiral', n: 3, radiusStep: '' }] }],
    });
    const [layer] = deserialize(file).layers;
    expect(layer.elements[0].strokeWidth).toBeGreaterThan(0);
    expect(layer.modifiers[0].radiusStep).toBe(12);
  });

  it('borne la croissance de spirale à l’import', () => {
    const file = JSON.stringify({ format: FORMAT, layers: [{ id: 'L1', elements: [], modifiers: [{ type: 'spiral', n: 3, radiusStep: 1e6 }] }] });
    expect(deserialize(file).layers[0].modifiers[0].radiusStep).toBe(100);
  });

  it('garde le signe des extensions d’une ligne et le refuse aux autres formes', () => {
    const file = JSON.stringify({
      format: 'illu/scene@3',
      layers: [
        {
          id: 'L1',
          elements: [
            { id: 'E1', type: 'line', x: 10, y: 20, rx: -40, ry: -30 },
            { id: 'E2', type: 'rect', x: 0, y: 0, rx: -40, ry: 12 },
          ],
        },
      ],
    });
    const [line, rect] = deserialize(file).layers[0].elements;
    expect(line).toMatchObject({ rx: -40, ry: -30 });
    expect(rect).toMatchObject({ rx: 0, ry: 12 });
  });

  it('refuse un fichier illisible ou d’un autre format', () => {
    expect(() => deserialize('{')).toThrow(/JSON valide/);
    expect(() => deserialize('{"format":"autre","layers":[]}')).toThrow(/Format inattendu/);
    expect(() => deserialize('{"format":"illu/scene@3"}')).toThrow(/tableau/);
  });

  it('relit un calque d’avant la pile : un modificateur unique devient une pile d’un', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@4',
      layers: [{ id: 'L1', modifier: { type: 'mirrorH', n: 2 } }],
      activeLayerId: 'L1',
    });
    expect(deserialize(raw).layers[0].modifiers).toHaveLength(1);
    expect(deserialize(raw).layers[0].modifiers[0]).toMatchObject({ type: 'mirrorH' });
  });

  it('un calque sans modificateur se relit comme une pile vide', () => {
    const raw = '{"format":"illu/scene@4","layers":[{"id":"L1"}],"activeLayerId":"L1"}';
    expect(deserialize(raw).layers[0].modifiers).toEqual([]);
  });

  it('clampe un N hors bornes au lieu de le propager', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@3',
      layers: [{ id: 'L1', modifier: { type: 'axial', n: -4 } }],
      activeLayerId: 'L1',
    });
    expect(deserialize(raw).layers[0].modifiers[0].n).toBe(1);
  });

  /* Avant `@8` le calque n'avait qu'une interpolation par propriété : chaque
     plage non neutre devient un étage de sa pile. */
  it('relit les plages d’un calque antérieur en pile d’interpolations', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@7',
      layers: [
        {
          id: 'L1',
          modifiers: [{ type: 'step' }, { type: 'mirrorH' }],
          propertyRanges: { opacity: [1, 0.2], scale: [1, 2] },
          rangeBindings: { opacity: 1, scale: 5 },
        },
      ],
      activeLayerId: 'L1',
    });
    expect(deserialize(raw).layers[0].interpolations).toMatchObject([
      { property: 'opacity', range: [1, 0.2], binding: 1 },
      /* Rang hors pile : la rampe redevient globale. */
      { property: 'scale', range: [1, 2], binding: null },
    ]);
  });

  /* Une plage restée neutre ne dessinait rien : elle n'encombre pas la pile. */
  it('une plage neutre ne devient pas une interpolation', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@7',
      layers: [{ id: 'L1', propertyRanges: { opacity: [1, 1], scale: [1, 0.5] } }],
      activeLayerId: 'L1',
    });
    expect(deserialize(raw).layers[0].interpolations).toMatchObject([{ property: 'scale' }]);
  });

  it('un fichier sans interpolation se relit avec une pile vide', () => {
    const raw = '{"format":"illu/scene@3","layers":[{"id":"L1"}],"activeLayerId":"L1"}';
    expect(deserialize(raw).layers[0].interpolations).toEqual([]);
  });

  /* Donnée externe : la propriété, la plage et la liaison sont ramenées dans
     leurs bornes plutôt que propagées telles quelles. */
  it('borne une interpolation importée', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@8',
      layers: [
        {
          id: 'L1',
          modifiers: [{ type: 'step' }],
          interpolations: [
            { id: 'I1', property: 'scale', range: [-4, 99], binding: 7 },
            { id: 'I2', property: 'inconnue', range: [0.5, 0.5] },
          ],
        },
      ],
      activeLayerId: 'L1',
    });
    expect(deserialize(raw).layers[0].interpolations).toMatchObject([
      { id: 'I1', property: 'scale', range: [0, 3], binding: null },
      { id: 'I2', property: 'opacity', range: [0.5, 0.5] },
    ]);
  });

  it('ramène `visible` à un booléen quelle que soit la valeur du fichier', () => {
    const read = (visible) =>
      deserialize(
        JSON.stringify({
          format: 'illu/scene@3',
          layers: [{ id: 'L1', visible }],
          activeLayerId: 'L1',
        }),
      ).layers[0].visible;
    expect(read(undefined)).toBe(true);
    expect(read(false)).toBe(false);
    expect(read('')).toBe(false);
    expect(read(0)).toBe(false);
    expect(read('oui')).toBe(true);
  });

  it('relit un ancien point plein : son diamètre devient l’épaisseur du calque', () => {
    const text = JSON.stringify({
      format: 'illu/scene@3',
      layers: [
        {
          id: 'L1',
          elements: [
            { id: 'E1', type: 'point', x: 0, y: 0, rx: 5, ry: 5, fill: '#abcdef', stroke: 'none', strokeWidth: 0 },
          ],
        },
      ],
    });
    const [layer] = deserialize(text).layers;
    /* La couleur du disque devient celle du trait. */
    expect(layer.elements[0]).toMatchObject({ filled: false, rx: 0, strokeWidth: 10, stroke: '#abcdef' });
  });

  it('relit un projet v1 : `radius` converti, forme unique devenue liste', () => {
    const v1 = JSON.stringify({
      format: 'illu/scene@1',
      layers: [
        {
          id: 'L1',
          name: 'Ancien calque',
          baseElement: { type: 'ellipse', x: 10, y: 20, radius: 33, stroke: '#abcdef' },
          modifier: { type: 'axial', n: 8 },
        },
      ],
      activeLayerId: 'L1',
    });
    const [layer] = deserialize(v1).layers;
    const { elements } = layer;
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ type: 'ellipse', x: 10, y: 20, rx: 33, ry: 33 });
    expect(elements[0].stroke).toBe('#abcdef');
    expect(elements[0].radius).toBeUndefined();
  });

  it('relit un projet v2 : forme unique devenue liste', () => {
    const v2 = JSON.stringify({
      format: 'illu/scene@2',
      layers: [{ id: 'L1', baseElement: { type: 'rect', x: 5, y: 6, rx: 20, ry: 10 } }],
      activeLayerId: 'L1',
    });
    expect(deserialize(v2).layers[0].elements[0]).toMatchObject({ type: 'rect', rx: 20, ry: 10 });
  });

  it('un calque v1 sans forme devient un calque sans forme', () => {
    const raw = '{"format":"illu/scene@1","layers":[{"id":"L1"}],"activeLayerId":"L1"}';
    expect(deserialize(raw).layers[0].elements).toEqual([]);
  });

  it('refuse un type de forme inconnu', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@3',
      layers: [{ id: 'L1', elements: [{ type: 'triangle', x: 0, y: 0 }] }],
      activeLayerId: 'L1',
    });
    expect(() => deserialize(raw)).toThrow(/Type de forme non pris en charge/);
  });

  it('rejette deux calques ou deux formes de même identifiant', () => {
    const duplicateLayers = JSON.stringify({
      format: 'illu/scene@3',
      layers: [{ id: 'L1' }, { id: 'L1' }],
      activeLayerId: 'L1',
    });
    expect(() => deserialize(duplicateLayers)).toThrow(/même identifiant/);

    const duplicateElements = JSON.stringify({
      format: 'illu/scene@3',
      layers: [
        { id: 'L1', elements: [{ id: 'E1', type: 'ellipse', x: 0, y: 0 }] },
        { id: 'L2', elements: [{ id: 'E1', type: 'ellipse', x: 0, y: 0 }] },
      ],
      activeLayerId: 'L1',
    });
    expect(() => deserialize(duplicateElements)).toThrow(/formes portent le même/);
  });
});

describe('dessin contraint (Maj)', () => {
  const origin = { x: 100, y: 100 };

  it('ellipse et rectangle deviennent cercle et carré', () => {
    expect(dragPatch('ellipse', origin, 30, -80, true)).toEqual({ rx: 80, ry: 80 });
    expect(dragPatch('rect', origin, -50, 20, true)).toEqual({ rx: 50, ry: 50 });
    expect(dragPatch('rect', origin, -50, 20)).toEqual({ rx: 50, ry: 20 });
  });

  it('la ligne s’aimante par pas de 45° en gardant sa longueur', () => {
    const patch = dragPatch('line', origin, 100, 10, true);
    expect(patch.ry).toBeCloseTo(0);
    expect(patch.rx).toBeCloseTo(Math.hypot(100, 10) / 2);
    const diagonal = dragPatch('line', origin, -40, 45, true);
    expect(Math.abs(diagonal.rx)).toBeCloseTo(Math.abs(diagonal.ry));
    expect(diagonal.rx).toBeLessThan(0);
    expect(diagonal.x).toBeCloseTo(origin.x + diagonal.rx);
  });

  it('les formes uniformes ne changent pas', () => {
    expect(dragPatch('polygon', origin, 30, 40, true)).toEqual(dragPatch('polygon', origin, 30, 40));
  });
});

describe('ellipse et polygone', () => {
  it('se sérialisent et se relisent, côtés et creux compris', () => {
    const layer = createLayer({
      elements: [
        createElement('ellipse', 10, 20, { rx: 30, ry: 12 }),
        createElement('polygon', 0, 0, { rx: 50, sides: 8, inner: 40 }),
      ],
    });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(deserialize(serialize(scene)).layers[0].elements).toMatchObject([
      { type: 'ellipse', rx: 30, ry: 12 },
      { type: 'polygon', rx: 50, sides: 8, inner: 40 },
    ]);
  });

  it('borne les côtés et le creux d’un polygone importé', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@9',
      layers: [
        {
          id: 'L1',
          elements: [
            { id: 'E1', type: 'polygon', x: 0, y: 0, sides: 1, inner: 300 },
            { id: 'E2', type: 'polygon', x: 0, y: 0, sides: 'x' },
            { id: 'E3', type: 'polygon', x: 0, y: 0, sides: 1e6, inner: -5 },
          ],
        },
      ],
    });
    expect(deserialize(raw).layers[0].elements).toMatchObject([
      { sides: 3, inner: 100 },
      { sides: 6, inner: 100 },
      { sides: 64, inner: 0 },
    ]);
  });
});

describe('lecture d’un tracé collé', () => {
  const pts = (trace) => trace.points.map((p) => [p.x, p.y]);

  it('lit M, L, H, V, Z en absolu et en relatif', () => {
    const [a] = parseTrace('M10 10 L20 10 h5 v5 H10 z');
    expect(a.closed).toBe(true);
    expect(pts(a)).toEqual([[10, 10], [20, 10], [25, 10], [25, 15], [10, 15]]);
    const [b] = parseTrace('m1,1 2,0 0,2');
    expect(pts(b)).toEqual([[1, 1], [3, 1], [3, 3]]);
  });

  it('un chemin qui reprend après Z repart du point de départ', () => {
    const traces = parseTrace('M0 0 L10 0 Z l0 10');
    expect(traces.map(pts)).toEqual([[[0, 0], [10, 0]], [[0, 0], [0, 10]]]);
  });

  it('lit les points d’une balise polygon (fermée) ou polyline (ouverte)', () => {
    expect(parseTrace('<polygon points="0,0 10,0 5,5"/>')[0].closed).toBe(true);
    expect(parseTrace("<polyline points='0,0 10,0'/>")[0].closed).toBe(false);
    expect(pts(parseTrace('0 0, 1e1 -2')[0])).toEqual([[0, 0], [10, -2]]);
  });

  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  const radii = (trace, cx, cy) => trace.points.map((p) => Math.hypot(p.x - cx, p.y - cy));

  it('échantillonne les courbes C et Q, fin de courbe exacte', () => {
    const [cubic] = parseTrace('M0 0 C0 10 10 10 10 0');
    expect(cubic.points.length).toBeGreaterThan(8);
    expect(near(cubic.points.at(-1), { x: 10, y: 0 })).toBe(true);
    /* Milieu d'une cubique symétrique : (5, 7.5). */
    expect(cubic.points.some((p) => near(p, { x: 5, y: 7.5 }))).toBe(true);
    const [quad] = parseTrace('m0 0 q5 10 10 0');
    expect(near(quad.points.at(-1), { x: 10, y: 0 })).toBe(true);
    expect(quad.points.some((p) => near(p, { x: 5, y: 5 }))).toBe(true);
  });

  it('S et T reflètent le point de contrôle précédent', () => {
    const [s] = parseTrace('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    const [c] = parseTrace('M0 0 C0 10 10 10 10 0 C10 -10 20 -10 20 0');
    expect(pts(s)).toEqual(pts(c));
    const [t] = parseTrace('M0 0 Q5 10 10 0 T20 0');
    const [q] = parseTrace('M0 0 Q5 10 10 0 Q15 -10 20 0');
    expect(pts(t)).toEqual(pts(q));
  });

  it('un cercle en deux arcs donne une polyligne fermée sur le cercle', () => {
    const [circle] = parseTrace('M0 10 A10 10 0 1 0 20 10 A10 10 0 1 0 0 10 Z');
    expect(circle.closed).toBe(true);
    expect(circle.points.length).toBeGreaterThan(16);
    for (const r of radii(circle, 10, 10)) expect(r).toBeCloseTo(10, 6);
    /* Sweep 0 depuis (0, 10) vers (20, 10) : l'arc passe par le bas (y = 20). */
    expect(circle.points.some((p) => near(p, { x: 10, y: 20 }))).toBe(true);
  });

  it('lit les drapeaux d’arc collés et agrandit un rayon trop petit', () => {
    const [packed] = parseTrace('M0 10a10 10 0 1020 0');
    const [spaced] = parseTrace('M0 10 a10 10 0 1 0 20 0');
    expect(pts(packed)).toEqual(pts(spaced));
    const [tight] = parseTrace('M0 0 A1 1 0 0 1 20 0');
    for (const r of radii(tight, 10, 0)) expect(r).toBeCloseTo(10, 6);
  });

  it('refuse un tracé qui dépasse le plafond de sommets', () => {
    const d = `M0 0 ${Array.from({ length: MAX_POINTS }, (_, i) => `L${i} 1`).join(' ')}`;
    expect(() => parseTrace(d)).toThrow(/sommets/);
  });

  it('refuse ce qui ne trace pas de segment', () => {
    expect(() => parseTrace('M0 0 B 1 1 2 2')).toThrow(/« B »/);
    expect(() => parseTrace('M0 0')).toThrow(/aucun segment/);
    expect(() => parseTrace('L 1 1')).toThrow(/commencer par M/);
    expect(() => parseTrace('0 0 1')).toThrow(/incomplète/);
    expect(() => parseTrace('   ')).toThrow(/Rien/);
  });
});

describe('tracé importé', () => {
  it('se relit, et un sommet illisible fait refuser le fichier', () => {
    const layer = createLayer({ elements: [createElement('polyline', 5, 5, { closed: false })] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const [element] = deserialize(serialize(scene)).layers[0].elements;
    expect(element).toMatchObject({ type: 'polyline', closed: false, points: SHAPES_DEFAULT_POINTS });

    const bad = (points) =>
      JSON.stringify({
        format: 'illu/scene@10',
        layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'polyline', x: 0, y: 0, points }] }],
      });
    expect(() => deserialize(bad([{ x: 0, y: 'a' }]))).toThrow(/illisible/);
    expect(() => deserialize(bad([]))).toThrow(/sommets/);
    expect(() => deserialize(bad(Array.from({ length: 5001 }, () => ({ x: 0, y: 0 }))))).toThrow(/5000/);
  });
});

describe('historique', () => {
  it('annule et rétablit une transition', () => {
    const store = createStore(createScene());
    const before = store.get();
    store.apply(addLayer);
    const after = store.get();
    store.undo();
    expect(store.get()).toBe(before);
    store.redo();
    expect(store.get()).toBe(after);
  });

  it('ignore un changement de sélection seule', () => {
    const store = createStore(createScene());
    const { id } = store.get().layers[0];
    store.apply(addElement, id, 'ellipse', 0, 0);
    const drawn = store.get();
    store.apply(setActiveElement, null);
    store.undo();
    expect(store.get().layers).not.toBe(drawn.layers);
    expect(store.get().layers[0].elements).toHaveLength(0);
  });

  it('compte un geste continu pour un seul pas', () => {
    const store = createStore(createScene());
    const before = store.get();
    const { id } = before.layers[0];
    store.begin('geste');
    store.apply(addElement, id, 'ellipse', 0, 0);
    const elementId = store.get().activeElementId;
    for (let rx = 1; rx < 50; rx += 1) store.apply(updateElement, elementId, { rx });
    store.end('geste');
    store.apply(updateElement, elementId, { rx: 80 });
    store.undo();
    expect(store.get().layers[0].elements[0].rx).toBe(49);
    store.undo();
    expect(store.get()).toBe(before);
  });

  it('un end étranger ne ferme pas le geste en cours', () => {
    const store = createStore(createScene());
    const before = store.get();
    store.begin('a');
    store.apply(addLayer);
    store.end('b');
    store.apply(addLayer);
    store.undo();
    expect(store.get()).toBe(before);
  });

  it('annuler en plein geste : la suite du geste reste un seul pas', () => {
    const store = createStore(createScene());
    store.apply(addLayer);
    const base = store.get();
    store.begin('g');
    store.apply(addLayer);
    store.undo();
    expect(store.get()).toBe(base);
    for (let i = 0; i < 3; i += 1) store.apply(addLayer);
    store.end('g');
    store.undo();
    expect(store.get()).toBe(base);
    store.undo();
    expect(store.get().layers).toHaveLength(1);
  });

  it('une nouvelle transition vide la pile de rétablissement', () => {
    const store = createStore(createScene());
    store.apply(addLayer);
    store.undo();
    store.apply(addLayer);
    const current = store.get();
    store.redo();
    expect(store.get()).toBe(current);
  });

  it('borne la profondeur à HISTORY_LIMIT', () => {
    const store = createStore(createScene());
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) store.apply(addLayer);
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) store.undo();
    expect(store.get().layers).toHaveLength(11);
  });

  it('annule un import', () => {
    const store = createStore(createScene());
    const before = store.get();
    store.set(deserialize(serialize(addLayer(createScene()))));
    store.undo();
    expect(store.get()).toBe(before);
  });
});

describe('rotation propre', () => {
  it('une forme neuve n’est pas tournée', () => {
    expect(createElement('rect', 0, 0).rotation).toBe(0);
  });

  it('se sérialise, et un fichier qui l’ignore se relit droit', () => {
    const layer = createLayer({ elements: [createElement('rect', 0, 0, { rotation: 30 })] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(deserialize(serialize(scene)).layers[0].elements[0].rotation).toBe(30);

    const legacy = JSON.stringify({
      format: 'illu/scene@10',
      layers: [
        {
          id: 'L1',
          elements: [
            { id: 'E1', type: 'rect', x: 0, y: 0 },
            { id: 'E2', type: 'rect', x: 0, y: 0, rotation: 'x' },
          ],
        },
      ],
    });
    expect(deserialize(legacy).layers[0].elements.map((e) => e.rotation)).toEqual([0, 0]);
  });

  it('recentrer un tracé tourné ne le déplace pas à l’écran', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ];
    const layer = createLayer({ elements: [createElement('polyline', 0, 0, { points, rotation: 90 })] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const [element] = recenterTrace(scene, layer.elements[0].id).layers[0].elements;
    /* Le milieu local (10, 0), tourné de 90°, tombe en (0, 10). */
    expect(element.x).toBeCloseTo(0);
    expect(element.y).toBeCloseTo(10);
    expect(element.points).toEqual([
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
});

describe('arc importé', () => {
  it('se relit, angles bornés et fermeture inconnue ramenée à « ouvert »', () => {
    const layer = createLayer({
      elements: [createElement('arc', 0, 0, { start: 45, end: 300, closure: 'chord' })],
    });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(deserialize(serialize(scene)).layers[0].elements[0]).toMatchObject({
      start: 45,
      end: 300,
      closure: 'chord',
    });

    const raw = JSON.stringify({
      format: 'illu/scene@11',
      layers: [
        {
          id: 'L1',
          elements: [{ id: 'E1', type: 'arc', x: 0, y: 0, start: -1e9, end: 'x', closure: 'spirale' }],
        },
      ],
    });
    expect(deserialize(raw).layers[0].elements[0]).toMatchObject({ start: -360, end: 180, closure: 'open' });
  });
});

describe('orientation des copies', () => {
  /* Extrémités d'une ligne rendue, par la même composition que le renderer :
     reflet autour du centre, puis rotation. */
  const ends = (child) =>
    [-1, 1].map((sign) => {
      const local = { x: sign * child.rx * (child.flip ? -1 : 1), y: sign * child.ry };
      const turned = rotateVector(local, child.rotation);
      return { x: child.x + turned.x, y: child.y + turned.y };
    });

  const axialRects = (modifier = {}) =>
    getRenderedChildren(
      createLayer({
        center,
        elements: [createElement('rect', 100, 0)],
        modifiers: [createModifier({ type: 'axial', n: 6, ...modifier })],
      }),
    );

  it('rectangle + axial n = 6 : six rectangles rayonnants', () => {
    const children = axialRects();
    expect(children).toHaveLength(6);
    children.forEach((child, i) => {
      expect(child.rotation).toBeCloseTo(i * 60);
      /* Rayonnant : l'axe long de la copie pointe vers le centre. */
      expect(Math.atan2(child.y, child.x)).toBeCloseTo(
        Math.atan2(Math.sin((child.rotation * Math.PI) / 180), Math.cos((child.rotation * Math.PI) / 180)),
      );
    });
  });

  it('case décochée : les copies gardent leur angle propre', () => {
    expect(axialRects({ orient: false }).map((c) => c.rotation)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('ligne + mirrorH : le reflet est le symétrique', () => {
    const line = createElement('line', 100, 20, { rx: 40, ry: 30 });
    const [original, reflected] = getRenderedChildren(
      createLayer({ center, elements: [line], modifiers: [createModifier({ type: 'mirrorH' })] }),
    );
    const mirrored = ends(original).map((p) => ({ x: -p.x, y: p.y }));
    const actual = ends(reflected);
    /* Même paire d'extrémités, dans l'ordre inverse ou non. */
    const match = (a, b) => a.every((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) < 1e-9);
    expect(match(actual, mirrored) || match(actual, [...mirrored].reverse())).toBe(true);
  });

  it('le reflet inverse le sens de la rotation propre', () => {
    const rect = createElement('rect', 100, 0, { rotation: 20 });
    const children = getRenderedChildren(
      createLayer({ center, elements: [rect], modifiers: [createModifier({ type: 'mirrorH' })] }),
    );
    expect(children.map((c) => [c.rotation, c.flip])).toEqual([
      [20, false],
      [-20, true],
    ]);
  });

  /* Deux reflets orthogonaux font un demi-tour, sans reflet. */
  it('mirrorH puis mirrorV composent un demi-tour', () => {
    const children = getRenderedChildren(
      createLayer({
        center,
        elements: [createElement('rect', 100, 20)],
        modifiers: [createModifier({ type: 'mirrorH' }), createModifier({ type: 'mirrorV' })],
      }),
    );
    const last = children.at(-1);
    expect(last.flip).toBe(false);
    expect(((last.rotation % 360) + 360) % 360).toBeCloseTo(180);
  });

  it('un fichier antérieur se relit case décochée, un fichier courant garde son réglage', () => {
    const legacy = JSON.stringify({
      format: 'illu/scene@12',
      layers: [{ id: 'L1', modifiers: [{ type: 'axial', n: 6 }] }],
    });
    expect(deserialize(legacy).layers[0].modifiers[0].orient).toBe(false);

    const layer = createLayer({ modifiers: [createModifier({ type: 'axial', orient: false })] });
    const reread = deserialize(serialize({ layers: [layer], activeLayerId: layer.id }));
    expect(reread.layers[0].modifiers[0].orient).toBe(false);

    const fresh = createLayer({ modifiers: [createModifier({ type: 'spiral' })] });
    const rereadFresh = deserialize(serialize({ layers: [fresh], activeLayerId: fresh.id }));
    expect(orients(rereadFresh.layers[0].modifiers[0])).toBe(true);
  });
});

import { parseDash, toggleElementVisibility } from '../src/scene.js';

describe('style de trait de la forme', () => {
  it('lit la saisie libre, bornée', () => {
    expect(parseDash('4, 2  1')).toEqual([4, 2, 1]);
    expect(parseDash('4 -1 x 1e9')).toEqual([4, 0, 100]);
    expect(parseDash('0 0')).toEqual([]);
    expect(parseDash('')).toEqual([]);
  });

  it('reste propre à chaque forme et survit à la sauvegarde', () => {
    const dotted = createElement('ellipse', 0, 0, { dash: [0, 2], linecap: 'round' });
    const layer = createLayer({ elements: [dotted, createElement('ellipse', 50, 0)] });
    const [first, second] = getRenderedChildren(layer);
    expect(first).toMatchObject({ dash: [0, 2], linecap: 'round' });
    expect(second).toMatchObject({ dash: [], linecap: 'butt' });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(deserialize(serialize(scene)).layers[0].elements[0]).toMatchObject({ dash: [0, 2], linecap: 'round' });
  });

  it('un ancien fichier se relit en trait plein, et un import est borné', () => {
    const shape = { id: 'E1', type: 'ellipse', x: 0, y: 0 };
    const old = JSON.stringify({ format: 'illu/scene@13', layers: [{ id: 'L1', elements: [shape] }] });
    expect(deserialize(old).layers[0].elements[0]).toMatchObject({ dash: [], linecap: 'butt' });

    /* `@13` orientait déjà : sa case se relit telle quelle. */
    const oriented = JSON.stringify({
      format: 'illu/scene@13',
      layers: [{ id: 'L1', modifiers: [{ type: 'axial', n: 4, orient: true }] }],
    });
    expect(deserialize(oriented).layers[0].modifiers[0].orient).toBe(true);
    const bad = JSON.stringify({
      format: 'illu/scene@14',
      layers: [{ id: 'L1', elements: [{ ...shape, dash: 'tirets', linecap: 42 }] }],
    });
    expect(deserialize(bad).layers[0].elements[0]).toMatchObject({ dash: [], linecap: 'butt' });
  });
});

describe('rotation et épaisseur interpolées', () => {
  it('survivent à la sauvegarde, bornées à l’import', () => {
    const layer = createLayer({
      elements: [createElement('ellipse', 0, 0)],
      interpolations: [
        createInterpolation({ property: 'rotation', range: [0, 180] }),
        createInterpolation({ property: 'strokeWidth', range: [4, 0.5] }),
      ],
    });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const back = deserialize(serialize(scene)).layers[0].interpolations;
    expect(back.map((i) => [i.property, i.range])).toEqual([
      ['rotation', [0, 180]],
      ['strokeWidth', [4, 0.5]],
    ]);

    const wild = JSON.stringify({
      format: 'illu/scene@15',
      layers: [{ id: 'L1', interpolations: [{ property: 'rotation', range: [-9999, 'x'] }] }],
    });
    expect(deserialize(wild).layers[0].interpolations[0].range).toEqual([-720, 0]);
  });

  it('une scène `@14` se relit sans rien interpoler de neuf', () => {
    const old = JSON.stringify({
      format: 'illu/scene@14',
      layers: [{ id: 'L1', interpolations: [{ property: 'scale', range: [1, 0.4] }] }],
    });
    expect(deserialize(old).layers[0].interpolations.map((i) => i.property)).toEqual(['scale']);
  });

  it('une scène `illu/scene@16` (ancien nom) se relit, orientation comprise', () => {
    const old = JSON.stringify({
      format: 'illu/scene@16',
      layers: [{ id: 'L1', modifiers: [{ id: 'M1', type: 'axial' }] }],
    });
    const again = deserialize(serialize(deserialize(old)));
    expect(JSON.parse(serialize(again)).format).toBe(FORMAT);
    expect(orients(again.layers[0].modifiers[0])).toBe(true);
  });

  it('le contour double se sauvegarde, borné ; une scène `@21` se relit sans', () => {
    const scene = { layers: [createLayer({ elements: [createElement('rect', 0, 0, { outlined: true, gap: 6 })] })] };
    const [element] = deserialize(serialize(scene)).layers[0].elements;
    expect(element).toMatchObject({ outlined: true, gap: 6 });
    const wild = JSON.stringify({
      format: 'vektor/scene@22',
      layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'rect', outlined: 'oui', gap: 1e9 }] }],
    });
    expect(deserialize(wild).layers[0].elements[0]).toMatchObject({ outlined: false, gap: 100 });
    const old = JSON.stringify({ format: 'vektor/scene@21', layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'rect' }] }] });
    expect(deserialize(old).layers[0].elements[0].outlined).toBe(false);
  });

  it('l’opacité d’un volume se sauvegarde ; absente (`@30`), la forme est opaque', () => {
    const scene = { layers: [createLayer({ elements: [createElement('rect', 0, 0, { height: 20, opaque: false })] })] };
    expect(deserialize(serialize(scene)).layers[0].elements[0].opaque).toBe(false);
    const old = JSON.stringify({ format: 'vektor/scene@30', layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'rect' }] }] });
    expect(deserialize(old).layers[0].elements[0].opaque).toBe(true);
  });

  it('une forme masquée se sauvegarde ; absente (`@31`), la forme est visible', () => {
    const element = createElement('rect', 0, 0);
    const scene = { layers: [createLayer({ elements: [element] })] };
    const hidden = toggleElementVisibility(scene, element.id);
    expect(hidden.layers[0].elements[0].hidden).toBe(true);
    expect(toggleElementVisibility(hidden, element.id).layers[0].elements[0].hidden).toBeUndefined();
    expect(toggleElementVisibility(scene, 'E-absent')).toBe(scene);
    expect(deserialize(serialize(hidden)).layers[0].elements[0].hidden).toBe(true);
    expect(deserialize(serialize(scene)).layers[0].elements[0].hidden).toBeUndefined();
    const old = JSON.stringify({ format: 'vektor/scene@31', layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'rect', hidden: 'oui' }] }] });
    expect(deserialize(old).layers[0].elements[0].hidden).toBeUndefined();
  });

  it('une scène `@19` recopie couleur et épaisseur du calque sur ses formes', () => {
    const old = JSON.stringify({
      format: 'vektor/scene@19',
      layers: [
        {
          id: 'L1',
          stroke: '#abcdef',
          strokeWidth: 4,
          elements: [
            { id: 'E1', type: 'ellipse', x: 0, y: 0 },
            { id: 'E2', type: 'rect', x: 0, y: 0 },
          ],
        },
      ],
    });
    const again = deserialize(serialize(deserialize(old)));
    for (const element of again.layers[0].elements) {
      expect(element).toMatchObject({ stroke: '#abcdef', strokeWidth: 4 });
    }
    expect(again.layers[0].stroke).toBeUndefined();
  });
});

describe('grille', () => {
  it('aimante au croisement le plus proche', () => {
    expect(snapToGrid({ x: 130, y: 44 }, 10)).toEqual({ x: 90, y: 0 });
    expect(snapToGrid({ x: 136, y: 46 }, 10)).toEqual({ x: 180, y: 90 });
  });

  it('laisse en place un point déjà sur la grille', () => {
    expect(snapToGrid({ x: 450, y: 270 }, 10)).toEqual({ x: 450, y: 270 });
  });
});

describe('grille ronde', () => {
  /* Centre (450, 450), rayon 450 : 5 cercles tous les 90, 4 rayons dont un vers le haut. */
  const near = (point, expected) => {
    expect(point.x).toBeCloseTo(expected.x);
    expect(point.y).toBeCloseTo(expected.y);
  };

  it('aimante au croisement cercle × rayon le plus proche', () => {
    near(snapToPolarGrid({ x: 460, y: 280 }, 5, 4), { x: 450, y: 270 });
    near(snapToPolarGrid({ x: 640, y: 470 }, 5, 4), { x: 630, y: 450 });
  });

  it('ramène au centre près du centre, au dernier cercle au-delà', () => {
    near(snapToPolarGrid({ x: 470, y: 440 }, 5, 4), { x: 450, y: 450 });
    near(snapToPolarGrid({ x: 450, y: -200 }, 5, 4), { x: 450, y: 0 });
    near(snapToPolarGrid({ x: 450, y: -200 }, 5, 4, 8), { x: 450, y: -180 });
  });
});

describe('booléens', () => {
  const trio = () => {
    const disque = createElement('ellipse', 0, 0);
    const carre = createElement('rect', 0, 0);
    const forme = createElement('rect', 0, 0, {
      booleans: [
        { with: disque.id, op: 'union' },
        { with: carre.id, op: 'subtract' },
      ],
    });
    const layer = createLayer({ elements: [disque, carre, forme] });
    return { disque, carre, forme, scene: { layers: [layer], activeLayerId: layer.id, activeElementId: forme.id } };
  };
  const shape = (scene, index) => scene.layers[0].elements[index];

  it('une forme naît sans booléen', () => {
    expect(createElement('rect', 0, 0).booleans).toEqual([]);
  });

  it('ajouter prend un outil pas encore employé, en intersection ; seule, rien', () => {
    const { disque, carre, forme, scene } = trio();
    const cleared = updateElement(scene, forme.id, { booleans: [{ with: disque.id, op: 'union' }] });
    expect(shape(addBoolean(cleared, forme.id), 2).booleans[1]).toEqual({ with: carre.id, op: 'intersect' });
    const alone = createElement('rect', 0, 0);
    const lonely = { layers: [createLayer({ elements: [alone] })] };
    expect(addBoolean(lonely, alone.id)).toBe(lonely);
  });

  it('point, ligne, tracé et arc ouverts restent hors des booléens', () => {
    const { disque, forme, scene } = trio();
    const withShape = (type, props) => {
      const open = createElement(type, 0, 0, props);
      const layer = { ...scene.layers[0], elements: [...scene.layers[0].elements, open] };
      return { open, scene: { ...scene, layers: [layer] } };
    };
    for (const [type, props] of [['point'], ['line'], ['polyline', { closed: false }], ['arc', { closure: 'open' }]]) {
      const { open, scene: next } = withShape(type, props);
      expect(addBoolean(next, open.id)).toBe(next);
      expect(updateBoolean(next, forme.id, 0, { with: open.id })).toBe(next);
    }
    /* Ouvrir un outil le retire des piles, ouvrir un hôte vide la sienne. */
    const { open: trace, scene: traced } = withShape('polyline', { closed: true });
    const used = updateBoolean(traced, forme.id, 0, { with: trace.id });
    expect(shape(used, 2).booleans[0].with).toBe(trace.id);
    expect(shape(updateElement(used, trace.id, { closed: false }), 2).booleans.map((step) => step.with)).not.toContain(
      trace.id,
    );
    const arced = updateElement(scene, forme.id, { type: 'arc', closure: 'open' });
    expect(shape(arced, 2).booleans).toEqual([]);
    expect(isClosedShape(disque)).toBe(true);
    /* Relu, un fichier perd les étapes qui impliquent une forme ouverte. */
    const saved = JSON.parse(serialize(traced));
    saved.layers[0].elements[2].booleans = [{ with: trace.id, op: 'union' }];
    saved.layers[0].elements[3].closed = false;
    saved.layers[0].elements[3].booleans = [{ with: disque.id, op: 'union' }];
    const read = deserialize(JSON.stringify(saved)).layers[0].elements;
    expect(read[2].booleans).toEqual([]);
    expect(read[3].booleans).toEqual([]);
  });

  it('chaque étape se règle et se retire à son rang', () => {
    const { disque, forme, scene } = trio();
    const changed = updateBoolean(scene, forme.id, 1, { op: 'intersect' });
    expect(shape(changed, 2).booleans.map((step) => step.op)).toEqual(['union', 'intersect']);
    expect(shape(removeBoolean(changed, forme.id, 1), 2).booleans).toEqual([{ with: disque.id, op: 'union' }]);
  });

  it('supprimer un outil retire ses étapes, pas les autres', () => {
    const { disque, carre, scene } = trio();
    expect(shape(removeElement(scene, disque.id), 1).booleans).toEqual([{ with: carre.id, op: 'subtract' }]);
  });

  it('les copies rendues savent leur rang de copie', () => {
    const { scene } = trio();
    const layer = { ...scene.layers[0], modifiers: [createModifier({ type: 'step', n: 2 })] };
    expect(getRenderedChildren(layer).map((c) => c.copy)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('survit à la sauvegarde ; outil absent, soi-même ou illisible retiré, mode inconnu ramené', () => {
    const { forme, scene } = trio();
    expect(shape(deserialize(serialize(scene)), 2).booleans).toEqual(forme.booleans);
    const raw = JSON.parse(serialize(scene));
    raw.layers[0].elements[2].booleans = [
      { with: 'E999999', op: 'union' },
      { with: forme.id, op: 'union' },
      { with: 42 },
      { with: forme.booleans[0].with, op: 'xor' },
    ];
    expect(shape(deserialize(JSON.stringify(raw)), 2).booleans).toEqual([
      { with: forme.booleans[0].with, op: 'intersect' },
    ]);
  });
  it('refuse une boucle : ajout, changement d’outil, import', () => {
    const { disque, carre, forme, scene } = trio();
    // disque employé par forme : forme ne peut devenir l'outil de disque, ni via carré.
    const onlyForme = updateElement(scene, disque.id, { booleans: [] });
    const viaCarre = updateElement(onlyForme, carre.id, { booleans: [{ with: forme.id, op: 'union' }] });
    expect(addBoolean(viaCarre, disque.id)).toBe(viaCarre);
    const withCarre = updateElement(scene, disque.id, { booleans: [{ with: carre.id, op: 'union' }] });
    expect(updateBoolean(withCarre, disque.id, 0, { with: forme.id })).toBe(withCarre);
    expect(closesLoop(scene.layers[0], disque.id, forme.id)).toBe(true);
    expect(closesLoop(scene.layers[0], disque.id, carre.id)).toBe(false);
    const raw = JSON.parse(serialize(scene));
    raw.layers[0].elements[0].booleans = [{ with: forme.id, op: 'union' }];
    expect(() => deserialize(JSON.stringify(raw))).toThrow(/boucle/);
  });
});

describe('pivot', () => {
  const dot = () => createElement('ellipse', 100, 0);
  const positions = (layer) => getRenderedChildren(layer).map(({ x, y }) => [Math.round(x), Math.round(y)]);

  it('le pivot du calque se règle, et refuse une coordonnée non finie', () => {
    const layer = createLayer();
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const next = setLayerCenter(scene, layer.id, { x: 10, y: -20 });
    expect(next.layers[0].center).toEqual({ x: 10, y: -20 });
    expect(setLayerCenter(scene, layer.id, { x: Number.NaN, y: 0 })).toBe(scene);
  });

  it('un modificateur sans pivot propre reprend celui du calque', () => {
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [dot()],
      modifiers: [createModifier({ type: 'mirrorH' })],
    });
    expect(positions(layer)).toEqual([[100, 0], [-100, 0]]);
    expect(pivotOf(layer, 0)).toEqual({ x: 0, y: 0 });
  });

  it('chaque étage tourne autour de son propre pivot', () => {
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [dot()],
      modifiers: [
        createModifier({ type: 'mirrorH', center: { x: 50, y: 0 } }),
        createModifier({ type: 'mirrorH' }),
      ],
    });
    /* 100 → reflet autour de 50 → 0 ; puis reflet autour du pivot du calque. */
    expect(positions(layer)).toEqual([[100, 0], [-100, 0], [0, 0], [0, 0]]);
    expect(pivotOf(layer, 0)).toEqual({ x: 50, y: 0 });
    expect(pivotOf(layer, 1)).toEqual({ x: 0, y: 0 });
  });

  it('le pivot propre survit à l’aller-retour JSON, et un pivot invalide retombe sur le calque', () => {
    const layer = createLayer({
      center: { x: 12, y: 34 },
      elements: [dot()],
      modifiers: [createModifier({ type: 'axial', center: { x: 5, y: 6 } }), createModifier({ type: 'spiral' })],
    });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(deserialize(serialize(scene))).toEqual(scene);

    const raw = JSON.parse(serialize(scene));
    raw.layers[0].modifiers[0].center = { x: 'nope', y: 1 };
    expect(deserialize(JSON.stringify(raw)).layers[0].modifiers[0]).not.toHaveProperty('center');
  });
});

describe('plafond de copies', () => {
  const stacked = (n) =>
    createLayer({
      elements: [createElement('ellipse', 0, 0)],
      modifiers: [createModifier({ n }), createModifier({ n }), createModifier({ n })],
    });

  it('compte les copies sans les énumérer', () => {
    expect(copyCount([])).toBe(1);
    expect(copyCount(stacked(12).modifiers)).toBe(1728);
    expect(copyCount([createModifier({ type: 'mirrorH', n: 50 })])).toBe(2);
  });

  it('suspend le rendu au-delà du plafond, pas en deçà', () => {
    expect(getRenderedChildren(stacked(12))).toHaveLength(1728);
    const over = stacked(200);
    expect(copyCount(over.modifiers)).toBeGreaterThan(MAX_COPIES);
    expect(isSuspended(over)).toBe(true);
    expect(getRenderedChildren(over)).toEqual([]);
  });
});

describe('étirement interpolé', () => {
  const stretched = (property, element) =>
    createLayer({
      elements: [element],
      modifiers: [createModifier({ n: 5, stepX: 0 })],
      interpolations: [createInterpolation({ property, range: [1, 0.2] })],
    });

  it('scaleY 1 → 0,2 sur 5 copies fait décroître ry, rx intact, et se relit', () => {
    const layer = stretched('scaleY', createElement('rect', 0, 0, { rx: 50, ry: 50 }));
    const children = getRenderedChildren(layer);
    expect(children.map((c) => Math.round(c.ry))).toEqual([50, 40, 30, 20, 10]);
    expect(children.every((c) => c.rx === 50)).toBe(true);
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const again = deserialize(serialize(scene));
    expect(again.layers[0].interpolations[0]).toMatchObject({ property: 'scaleY', range: [1, 0.2] });
    expect(getRenderedChildren(again.layers[0]).map((c) => c.ry)).toEqual(children.map((c) => c.ry));
  });

  it('scaleX étire les sommets d’un tracé, rien sur le point', () => {
    const trace = getRenderedChildren(
      stretched('scaleX', createElement('polyline', 0, 0, { points: [{ x: -10, y: 5 }, { x: 10, y: -5 }] })),
    );
    expect(trace.at(-1).points.map((p) => [p.x, p.y].map((v) => Math.round(v * 1e9) / 1e9))).toEqual([[-2, 5], [2, -5]]);
    const dots = getRenderedChildren(stretched('scaleX', createElement('point', 0, 0)));
    expect(dots.every((c) => c.rx === 0 && c.ry === 0)).toBe(true);
  });
});

describe('courbes de rampe', () => {
  const values = (curve, n = 5) => Array.from({ length: n }, (_, i) => curveRamp(curve, i, n));

  it('rend chaque courbe sur cinq copies', () => {
    expect(values('linear')).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(values('easeIn')).toEqual([0, 0.0625, 0.25, 0.5625, 1]);
    expect(values('easeOut')).toEqual([0, 0.4375, 0.75, 0.9375, 1]);
    expect(values('pingPong')).toEqual([0, 0.5, 1, 0.5, 0]);
    expect(values('alternate')).toEqual([0, 1, 0, 1, 0]);
  });

  it('une courbe absente ou inconnue reste linéaire, et n ≤ 1 ne rend pas NaN', () => {
    expect(values(undefined)).toEqual(values('linear'));
    expect(values('bogus')).toEqual(values('linear'));
    for (const curve of Object.keys(CURVES)) expect(curveRamp(curve, 0, 1)).toBe(0);
  });

  it('l’aléatoire est déterministe par graine, dans [0, 1), et change avec elle', () => {
    const draw = (seed) => Array.from({ length: 8 }, (_, i) => curveRamp('random', i, 8, seed));
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
    expect(draw(7).every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(draw(7)).size).toBe(8);
  });

  it('une interpolation aléatoire rend le même dessin après sérialisation', () => {
    const layer = createLayer({
      elements: [createElement('ellipse', 0, 0)],
      modifiers: [createModifier({ n: 6 })],
      interpolations: [createInterpolation({ property: 'rotation', range: [0, 90], curve: 'random', seed: 1234 })],
    });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const again = deserialize(serialize(scene));
    expect(again.layers[0].interpolations[0].seed).toBe(1234);
    const rotations = (s) => getRenderedChildren(s.layers[0]).map((c) => c.rotation);
    expect(rotations(again)).toEqual(rotations(scene));
    expect(new Set(rotations(scene)).size).toBeGreaterThan(1);
  });

  it('une graine illisible se replie sur 0', () => {
    const layer = createLayer({ interpolations: [createInterpolation({ curve: 'random', seed: 5 })] });
    const raw = JSON.parse(serialize({ layers: [layer], activeLayerId: layer.id, activeElementId: null }));
    raw.layers[0].interpolations[0].seed = 'x';
    expect(deserialize(JSON.stringify(raw)).layers[0].interpolations[0].seed).toBe(0);
  });

  it('s’applique aux copies du calque, étage lié compris', () => {
    const layer = createLayer({
      elements: [createElement('ellipse', 0, 0)],
      modifiers: [createModifier({ n: 3 }), createModifier({ n: 2 })],
      interpolations: [
        createInterpolation({ property: 'opacity', range: [1, 0], curve: 'pingPong' }),
        createInterpolation({ property: 'scale', range: [1, 2], curve: 'alternate', binding: 1 }),
      ],
    });
    const children = getRenderedChildren(layer);
    expect(children.map((child) => child.opacity)).toEqual([1, 0.6, 0.2, 0.2, 0.6, 1].map((v) => expect.closeTo(v)));
    expect(children.map((child) => child.scale)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('défaut linéaire, et survit à l’aller-retour JSON', () => {
    expect(createInterpolation().curve).toBe('linear');
    const layer = createLayer({ interpolations: [createInterpolation({ curve: 'easeOut' })] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(deserialize(serialize(scene))).toEqual(scene);
    const raw = JSON.parse(serialize(scene));
    raw.layers[0].interpolations[0].curve = '<script>';
    expect(deserialize(JSON.stringify(raw)).layers[0].interpolations[0].curve).toBe('linear');
    raw.format = 'vektor/scene@17';
    delete raw.layers[0].interpolations[0].curve;
    expect(deserialize(JSON.stringify(raw)).layers[0].interpolations[0].curve).toBe('linear');
  });
});

describe('recoupements creux', () => {
  it('bascule par transition et survit à l’aller-retour JSON', () => {
    const layer = createLayer({ elements: [createElement('ellipse', 0, 0)] });
    const scene = setLayerEvenOdd({ layers: [layer], activeLayerId: layer.id, activeElementId: null }, layer.id, true);
    expect(scene.layers[0].evenOdd).toBe(true);
    expect(deserialize(serialize(scene))).toEqual(scene);
    const raw = JSON.parse(serialize(scene));
    raw.layers[0].evenOdd = 'yes';
    expect(deserialize(JSON.stringify(raw)).layers[0].evenOdd).toBe(false);
  });
});

describe('interpolation de couleur', () => {
  const colorLayer = (interpolations, filled = false) =>
    createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('ellipse', 0, 0, { filled })],
      modifiers: [{ type: 'step', n: 3, stepX: 10, stepY: 0 }],
      interpolations,
    });
  const tint = (range, overrides = {}) => createInterpolation({ property: 'color', range, ...overrides });

  it('mélange deux couleurs hexadécimales', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lerpColor('#ee4722', '#7dd3c0', 0)).toBe('#ee4722');
    expect(lerpColor('#EE4722', '#7dd3c0', 1)).toBe('#7dd3c0');
  });

  it('fait courir trait et aplat le long des copies', () => {
    const children = getRenderedChildren(colorLayer([tint(['#000000', '#ffffff'])], true));
    expect(children.map((c) => c.stroke)).toEqual(['#000000', '#808080', '#ffffff']);
    expect(children.map((c) => c.fill)).toEqual(['#000000', '#808080', '#ffffff']);
    expect(children.every((c) => c.color === undefined)).toBe(true);
  });

  it('suit la courbe, et la dernière de la pile l’emporte', () => {
    const [first] = getRenderedChildren(colorLayer([tint(['#000000', '#ffffff'], { curve: 'pingPong' })]));
    expect(first.stroke).toBe('#000000');
    const stacked = getRenderedChildren(colorLayer([tint(['#000000', '#ffffff']), tint(['#ff0000', '#ff0000'])]));
    expect(stacked.map((c) => c.stroke)).toEqual(['#ff0000', '#ff0000', '#ff0000']);
  });

  it('passer une interpolation à la couleur lui donne une plage de couleurs', () => {
    const layer = createLayer({ interpolations: [createInterpolation()] });
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const [interpolation] = updateInterpolation(scene, layer.id, layer.interpolations[0].id, { property: 'color' })
      .layers[0].interpolations;
    expect(interpolation.range).toEqual(RANGE_BOUNDS.color.defaultRange);
    expect(interpolation.range.every((value) => /^#[0-9a-f]{6}$/.test(value))).toBe(true);
  });

  it('se sauvegarde, se relit, et une couleur illisible se replie sur le défaut', () => {
    const layer = colorLayer([tint(['#112233', '#445566'])]);
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    const back = deserialize(serialize(scene));
    expect(back.layers[0].interpolations[0]).toMatchObject({ property: 'color', range: ['#112233', '#445566'] });

    const raw = JSON.parse(serialize(scene));
    raw.layers[0].interpolations[0].range = ['rouge', 42];
    const [fallback] = deserialize(JSON.stringify(raw)).layers[0].interpolations;
    expect(fallback.range).toEqual(RANGE_BOUNDS.color.defaultRange);
  });
});

describe('plan 3D', async () => {
  const { extrusion, outlinePath, planeMatrix, project, silhouette, unproject } = await import('../src/plane.js');
  const { setLayerPlane, DEFAULT_PLANE, MAX_TILT, STAGE: stage } = await import('../src/scene.js');
  const close = (p, q) => {
    expect(p.x).toBeCloseTo(q.x, 6);
    expect(p.y).toBeCloseTo(q.y, 6);
  };

  it('à plat (inclinaison 0), la projection est l’identité', () => {
    close(project(planeMatrix({ tilt: 0, heading: 37 }), { x: 12, y: -40 }), { x: 12, y: -40 });
  });

  it('écrase la direction de la pente autour du centre de la scène', () => {
    const matrix = planeMatrix({ tilt: 60, heading: 0 });
    const center = { x: stage.width / 2, y: stage.height / 2 };
    close(project(matrix, center), center);
    close(project(matrix, { x: center.x + 100, y: center.y + 100 }), { x: center.x + 100, y: center.y + 50 });
  });

  it('se laisse inverser pour lire le pointeur dans le repère du plan', () => {
    const matrix = planeMatrix({ tilt: 70, heading: 123 });
    const point = { x: 314, y: -27 };
    close(unproject(matrix, project(matrix, point)), point);
  });

  it('extrude vers le haut de l’écran, de la hauteur × sinus de l’inclinaison', () => {
    close(extrusion({ tilt: 30, heading: 0 }, 10), { x: 0, y: -5 });
    close(extrusion({ tilt: 90, heading: 90 }, 10), { x: 10, y: 0 });
    close(extrusion({ tilt: 0, heading: 0 }, 10), { x: 0, y: 0 });
  });

  it('une ellipse extrudée n’a que deux arêtes de silhouette', () => {
    const { points, closed, corners } = outlinePath(createElement('ellipse', 0, 0, { rx: 80, ry: 40 }));
    expect(corners).toEqual([]);
    expect(silhouette(points, closed, { x: 0, y: -10 })).toHaveLength(2);
  });

  it('un contour ouvert garde ses deux bouts, un point son unique sommet', () => {
    const line = outlinePath(createElement('line', 0, 0, { rx: 30, ry: 0 }));
    expect(silhouette(line.points, line.closed, { x: 0, y: -10 })).toEqual([0, 1]);
    const dot = outlinePath(createElement('point', 5, 5));
    expect(silhouette(dot.points, dot.closed, { x: 0, y: -10 })).toEqual([0]);
  });

  it('un rectangle extrudé dans l’axe d’un côté a ses coins pour silhouette', () => {
    const { points, closed, corners } = outlinePath(createElement('rect', 0, 0, { rx: 20, ry: 10 }));
    expect(corners).toEqual([0, 1, 2, 3]);
    expect(silhouette(points, closed, { x: 0, y: -10 })).toEqual([0, 1, 2, 3]);
  });

  it('décale un contour fermé vers l’extérieur, ou l’intérieur, quel que soit son sens', async () => {
    const { offsetPolygon } = await import('../src/plane.js');
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const out = offsetPolygon(square, 2);
    close(out[0], { x: -2, y: -2 });
    close(out[2], { x: 12, y: 12 });
    close(offsetPolygon([...square].reverse(), -2)[0], { x: 2, y: 8 });
  });

  it('passer un calque en 3D donne la profondeur par défaut à ses formes à plat, et aux nouvelles', async () => {
    const { DEFAULT_DEPTH } = await import('../src/scene.js');
    const layer = createLayer({ elements: [createElement('rect', 0, 0), createElement('ellipse', 0, 0, { height: 40 })] });
    const scene = setLayerPlane({ layers: [layer], activeLayerId: layer.id, activeElementId: null }, layer.id, {});
    expect(scene.layers[0].plane).toMatchObject({ tilt: 45, heading: 45 });
    expect(scene.layers[0].elements.map((element) => element.height)).toEqual([DEFAULT_DEPTH, 40]);
    /* Un réglage du plan déjà actif ne touche pas aux formes. */
    const flat = updateElement(scene, scene.layers[0].elements[0].id, { height: 0 });
    expect(setLayerPlane(flat, layer.id, { tilt: 30 }).layers[0].elements[0].height).toBe(0);
    const added = addElement(scene, layer.id, 'point', 0, 0);
    expect(added.layers[0].elements.at(-1).height).toBe(DEFAULT_DEPTH);
    expect(addElement({ layers: [layer], activeLayerId: layer.id, activeElementId: null }, layer.id, 'point', 0, 0).layers[0].elements.at(-1).height).toBe(0);
  });

  it('setLayerPlane pose le plan par défaut, le règle borné, le retire', () => {
    const layer = createLayer();
    const scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    expect(layer.plane).toBeNull();
    const on = setLayerPlane(scene, layer.id, {});
    expect(on.layers[0].plane).toEqual(DEFAULT_PLANE);
    expect(scene.layers[0].plane).toBeNull();
    const tuned = setLayerPlane(on, layer.id, { tilt: 200, heading: -90, sides: 'plein' });
    expect(tuned.layers[0].plane).toEqual({ enabled: true, tilt: MAX_TILT, heading: 270, sides: 'transparent' });
    expect(setLayerPlane(tuned, layer.id, null).layers[0].plane).toEqual({ ...tuned.layers[0].plane, enabled: false });
  });

  it('éteint puis rallumé, le plan garde ses angles et chaque forme sa profondeur', async () => {
    const { activePlane, togglePlane } = await import('../src/scene.js');
    const layer = createLayer({ elements: [createElement('rect', 0, 0), createElement('ellipse', 0, 0)] });
    let scene = togglePlane({ layers: [layer], activeLayerId: layer.id, activeElementId: null }, layer.id);
    scene = setLayerPlane(scene, layer.id, { tilt: 30, heading: 120 });
    const [rect, disk] = scene.layers[0].elements;
    scene = updateElement(updateElement(scene, rect.id, { height: 0 }), disk.id, { height: 42 });
    scene = togglePlane(scene, layer.id);
    expect(activePlane(scene.layers[0])).toBeNull();
    scene = togglePlane(scene, layer.id);
    expect(scene.layers[0].plane).toMatchObject({ enabled: true, tilt: 30, heading: 120 });
    expect(scene.layers[0].elements.map((element) => element.height)).toEqual([0, 42]);
  });

  it('se sauvegarde, et un fichier @22 se relit à plat', () => {
    const layer = createLayer({
      plane: { tilt: 40, heading: 15, sides: 'filled' },
      elements: [createElement('ellipse', 0, 0, { height: -25 })],
    });
    const again = deserialize(serialize({ layers: [layer], activeLayerId: layer.id, activeElementId: null }));
    expect(again.layers[0].plane).toEqual({ enabled: true, tilt: 40, heading: 15, sides: 'filled' });
    const off = createLayer({ plane: { enabled: false, tilt: 20, heading: 10, sides: 'transparent' } });
    expect(deserialize(serialize({ layers: [off], activeLayerId: off.id, activeElementId: null })).layers[0].plane.enabled).toBe(false);
    /* Centrée, une profondeur négative dessinerait pareil : relue en absolu. */
    expect(again.layers[0].elements[0].height).toBe(25);

    const old = JSON.stringify({
      format: 'vektor/scene@22',
      layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'rect' }] }],
    });
    expect(deserialize(old).layers[0].plane).toBeNull();
    expect(deserialize(old).layers[0].elements[0].height).toBe(0);

    const wild = JSON.stringify({
      format: 'vektor/scene@23',
      layers: [{ id: 'L1', plane: { tilt: 'x', heading: 1e9, sides: 1 }, elements: [{ id: 'E1', type: 'rect', height: 1e9 }] }],
    });
    const read = deserialize(wild).layers[0];
    expect(read.plane.tilt).toBe(DEFAULT_PLANE.tilt);
    expect(read.plane.heading).toBeGreaterThanOrEqual(0);
    expect(read.plane.heading).toBeLessThan(360);
    expect(read.plane.sides).toBe('transparent');
    expect(read.elements[0].height).toBe(1000);
  });
});

describe('forme logée : retirée', () => {
  it('un lien `inside` d’un ancien fichier est oublié à la lecture', () => {
    const raw = JSON.stringify({
      format: 'vektor/scene@32',
      layers: [{ id: 'L1', elements: [{ id: 'E1', type: 'ellipse' }, { id: 'E2', type: 'point', inside: 'E1' }] }],
    });
    expect(deserialize(raw).layers[0].elements.every((el) => !('inside' in el))).toBe(true);
  });
});

describe('répétition linéaire des points', () => {
  /* La pile est celle du point : c'est elle seule qui décide du lien. */
  const pointLayer = (modifiers, layerModifiers = []) =>
    createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('point', 10, 0, { modifiers })],
      modifiers: layerModifiers,
    });
  const vertices = (child) => child.points.map((p) => [child.x + p.x, child.y + p.y]);

  it('relie les copies d’un pas en un seul tracé', () => {
    const children = getRenderedChildren(pointLayer([createModifier({ n: 3, stepX: 50, linear: true })]));
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ type: 'polyline', closed: false });
    expect(vertices(children[0])).toEqual([[10, 0], [60, 0], [110, 0]]);
  });

  it('ne relie pas sans étage coché', () => {
    const children = getRenderedChildren(pointLayer([createModifier({ n: 3 })]));
    expect(children.map((c) => c.type)).toEqual(['point', 'point', 'point']);
  });

  it('ne relie pas le long des étages du calque', () => {
    const children = getRenderedChildren(pointLayer([], [createModifier({ n: 3, linear: true })]));
    expect(children.map((c) => c.type)).toEqual(['point', 'point', 'point']);
  });

  it('chaque copie du calque porte son propre tracé', () => {
    const children = getRenderedChildren(
      pointLayer([createModifier({ n: 2, stepX: 50, linear: true })], [createModifier({ n: 3, stepX: 0, stepY: 40 })]),
    );
    expect(children).toHaveLength(3);
    expect(vertices(children[2])).toEqual([[10, 80], [60, 80]]);
  });

  it('un miroir donne un segment, l’axial un tracé fermé', () => {
    const [mirror] = getRenderedChildren(pointLayer([createModifier({ type: 'mirrorH', linear: true })]));
    expect(mirror.points).toHaveLength(2);
    const ring = getRenderedChildren(pointLayer([createModifier({ type: 'axial', n: 4, linear: true })]));
    expect(ring).toHaveLength(1);
    expect(ring[0]).toMatchObject({ closed: true });
    expect(ring[0].points).toHaveLength(4);
  });

  it('ne relie que le long des étages cochés d’une pile', () => {
    const children = getRenderedChildren(
      pointLayer([createModifier({ n: 3, stepX: 50 }), createModifier({ n: 2, stepX: 0, stepY: 40, linear: true })]),
    );
    /* Trois rangées d'un segment vertical chacune. */
    expect(children).toHaveLength(3);
    expect(vertices(children[1])).toEqual([[60, 0], [60, 40]]);
  });

  it('le tracé porte le style de trait du point', () => {
    const layer = pointLayer([createModifier({ n: 2, linear: true })]);
    const styled = { ...layer, elements: [{ ...layer.elements[0], dash: [2, 1], linecap: 'square', outlined: true }] };
    const [line] = getRenderedChildren(styled);
    expect(line).toMatchObject({ dash: [2, 1], linecap: 'square', outlined: true, fill: 'none' });
  });

  it('survit à la sauvegarde', () => {
    const scene = { ...createScene(), layers: [pointLayer([createModifier({ linear: true })])] };
    const [layer] = deserialize(serialize(scene)).layers;
    expect(layer.elements[0].modifiers[0].linear).toBe(true);
    expect(layer.elements[0]).not.toHaveProperty('linear');
  });

  it('un fichier @24 relié par le calque redevient des points', () => {
    const raw = {
      format: 'vektor/scene@24',
      layers: [{
        id: 'L1',
        modifiers: [{ type: 'step', n: 3, linear: true }],
        elements: [{ id: 'E1', type: 'point', x: 0, y: 0, linear: true }],
      }],
    };
    const [layer] = deserialize(JSON.stringify(raw)).layers;
    expect(layer.modifiers[0].linear).toBeUndefined();
    expect(getRenderedChildren(layer).map((c) => c.type)).toEqual(['point', 'point', 'point']);
  });

  it('un fichier @24 garde l’orientation des copies', () => {
    const raw = { format: 'vektor/scene@24', layers: [{ id: 'L1', modifiers: [{ type: 'axial', n: 4 }], elements: [] }] };
    expect(deserialize(JSON.stringify(raw)).layers[0].modifiers[0].orient).toBeUndefined();
  });

  it('lissé, le tracé passe par les copies en courbe', () => {
    const [line] = getRenderedChildren(pointLayer([createModifier({ n: 3, stepX: 50, stepY: 20, linear: true, smooth: true })]));
    const points = vertices(line);
    expect(points.length).toBeGreaterThan(3);
    for (const copy of [[10, 0], [60, 20], [110, 40]]) {
      expect(points.some(([x, y]) => Math.hypot(x - copy[0], y - copy[1]) < 1e-9)).toBe(true);
    }
    expect(points.at(-1)).toEqual([110, 40]);
  });

  it('lissé, l’axial se referme en cercle', () => {
    const [ring] = getRenderedChildren(pointLayer([createModifier({ type: 'axial', n: 6, linear: true, smooth: true })]));
    expect(ring.closed).toBe(true);
    const radii = vertices(ring).map(([x, y]) => Math.hypot(x, y));
    expect(radii.length).toBeGreaterThan(6);
    for (const r of radii) expect(Math.abs(r - 10)).toBeLessThan(1e-9);
  });

  it('lissé, une spirale suit la spirale exacte entre les copies', () => {
    const [arc] = getRenderedChildren(
      pointLayer([createModifier({ type: 'spiral', n: 5, angleStep: 1.2, radiusStep: 40, linear: true, smooth: true })]),
    );
    /* Spirale logarithmique : r = 10·1,4^(θ/1,2), sans ondulation entre copies. */
    for (const [x, y] of vertices(arc)) {
      const turns = Math.atan2(y, x);
      const theta = [0, 1, 2, 3].map((w) => turns + w * 2 * Math.PI).find((t) => t >= -1e-9 && t <= 4.8 + 1e-9);
      expect(Math.abs(Math.hypot(x, y) - 10 * 1.4 ** (theta / 1.2))).toBeLessThan(1e-6);
    }
  });

  it('lissé, un arc ouvert garde sa courbure jusqu’aux extrémités', () => {
    const [arc] = getRenderedChildren(
      pointLayer([createModifier({ type: 'spiral', n: 6, angleStep: 0.6, radiusStep: 0, linear: true, smooth: true })]),
    );
    for (const [x, y] of vertices(arc)) expect(Math.abs(Math.hypot(x, y) - 10)).toBeLessThan(0.1);
  });

  it('en 3D, un tracé lissé n’a d’arêtes de coin qu’à ses bouts', async () => {
    const { outlinePath } = await import('../src/plane.js');
    const smoothed = (type, n) =>
      getRenderedChildren(pointLayer([createModifier({ type, n, angleStep: 0.6, radiusStep: 0, linear: true, smooth: true })]))[0];
    const arc = outlinePath(smoothed('spiral', 5));
    expect(arc.corners).toEqual([0, arc.points.length - 1]);
    expect(outlinePath(smoothed('axial', 6)).corners).toEqual([]);
    const plain = getRenderedChildren(pointLayer([createModifier({ n: 3, linear: true })]))[0];
    expect(outlinePath(plain).corners).toEqual([0, 1, 2]);
  });

  it('le lissage survit à la sauvegarde, seulement sur un étage de point', () => {
    const scene = { ...createScene(), layers: [pointLayer([createModifier({ linear: true, smooth: true })], [createModifier({ smooth: true })])] };
    const [layer] = deserialize(serialize(scene)).layers;
    expect(layer.elements[0].modifiers[0].smooth).toBe(true);
    expect(layer.modifiers[0].smooth).toBeUndefined();
  });
});

describe('répétitions et itérations de la forme', () => {
  const at = (child) => [Math.round(child.x), Math.round(child.y)];

  it('la forme se répète d’abord, puis le calque répète le tout', () => {
    const layer = createLayer({
      center: { x: 0, y: 0 },
      modifiers: [createModifier({ n: 2, stepX: 0, stepY: 100 })],
      elements: [createElement('ellipse', 0, 0, { modifiers: [createModifier({ n: 3, stepX: 10 })] })],
    });
    expect(getRenderedChildren(layer).map(at)).toEqual([[0, 0], [10, 0], [20, 0], [0, 100], [10, 100], [20, 100]]);
  });

  it('le pivot par défaut d’un étage de forme est celui du calque', () => {
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('ellipse', 10, 0, { modifiers: [createModifier({ type: 'axial', n: 2 })] })],
    });
    expect(getRenderedChildren(layer).map(at)).toEqual([[10, 0], [-10, 0]]);
    expect(pivotOf(layer, 0, layer.elements[0])).toEqual({ x: 0, y: 0 });
  });

  it('l’orientation de la forme se compose avec celle du calque', () => {
    const layer = createLayer({
      center: { x: 0, y: 0 },
      modifiers: [createModifier({ type: 'axial', n: 4 })],
      elements: [createElement('line', 10, 0, { modifiers: [createModifier({ type: 'axial', n: 2 })] })],
    });
    const rotations = getRenderedChildren(layer).map((c) => Math.round(((c.rotation % 360) + 360) % 360));
    expect(rotations).toEqual([0, 180, 90, 270, 180, 0, 270, 90]);
  });

  it('les interpolations de la forme courent sur ses copies et se composent avec le calque', () => {
    const layer = createLayer({
      modifiers: [createModifier({ n: 2 })],
      interpolations: [createInterpolation({ property: 'opacity', range: [1, 0.5] })],
      elements: [
        createElement('ellipse', 0, 0, {
          modifiers: [createModifier({ n: 3 })],
          interpolations: [createInterpolation({ property: 'opacity', range: [1, 0] })],
        }),
      ],
    });
    expect(getRenderedChildren(layer).map((c) => c.opacity)).toEqual([1, 0.5, 0, 0.5, 0.25, 0]);
  });

  it('la couleur de la forme l’emporte sur celle du calque', () => {
    const layer = createLayer({
      interpolations: [createInterpolation({ property: 'color', range: ['#ff0000', '#ff0000'] })],
      elements: [createElement('ellipse', 0, 0, {
        interpolations: [createInterpolation({ property: 'color', range: ['#0000ff', '#0000ff'] })],
      })],
    });
    expect(getRenderedChildren(layer)[0].stroke).toBe('#0000ff');
  });

  it('une interpolation de forme se lie à un étage de sa pile', () => {
    const layer = createLayer({
      elements: [createElement('ellipse', 0, 0, {
        modifiers: [createModifier({ n: 2 }), createModifier({ n: 2 })],
        interpolations: [createInterpolation({ property: 'opacity', range: [1, 0], binding: 0 })],
      })],
    });
    expect(getRenderedChildren(layer).map((c) => c.opacity)).toEqual([1, 1, 0, 0]);
  });

  it('les transitions de pile visent aussi une forme', () => {
    const base = createScene();
    let scene = addElement(base, base.layers[0].id, 'ellipse', 0, 0);
    const id = scene.activeElementId;
    scene = addModifier(scene, id);
    scene = addModifier(scene, id);
    scene = updateModifier(scene, id, 1, { type: 'axial' });
    scene = addInterpolation(scene, id);
    const interpolation = scene.layers[0].elements[0].interpolations[0];
    scene = updateInterpolation(scene, id, interpolation.id, { binding: 1 });
    scene = moveModifier(scene, id, 1, -1);
    const [element] = scene.layers[0].elements;
    expect(element.modifiers.map((m) => m.type)).toEqual(['axial', 'step']);
    expect(element.interpolations[0].binding).toBe(0);
    expect(scene.layers[0].modifiers).toEqual([]);
    scene = removeModifier(scene, id, 0);
    expect(scene.layers[0].elements[0].interpolations[0].binding).toBe(null);
  });

  it('suspend le calque sur le total des copies', () => {
    const big = createModifier({ n: 150 });
    const layer = createLayer({
      modifiers: [big],
      elements: [createElement('ellipse', 0, 0, { modifiers: [big] })],
    });
    expect(isSuspended(layer)).toBe(true);
    expect(getRenderedChildren(layer)).toEqual([]);
  });

  it('suspend le calque sur copies × formes, même sans pile de forme', () => {
    const layer = createLayer({
      modifiers: [createModifier({ n: 2000 })],
      elements: Array.from({ length: 6 }, (_, i) => createElement('ellipse', i, 0)),
    });
    expect(copyTotal(layer)).toBe(12000);
    expect(isSuspended(layer)).toBe(true);
  });

  it('survit à la sauvegarde', () => {
    const element = createElement('ellipse', 0, 0, {
      modifiers: [createModifier({ type: 'axial', n: 5, linear: true })],
      interpolations: [createInterpolation({ property: 'scale', range: [1, 2], binding: 0 })],
    });
    const scene = { ...createScene(), layers: [createLayer({ elements: [element] })] };
    const [read] = deserialize(serialize(scene)).layers[0].elements;
    expect(read.modifiers).toHaveLength(1);
    expect(read.modifiers[0]).toMatchObject({ type: 'axial', n: 5 });
    /* Seul un point relie ses copies. */
    expect(read.modifiers[0].linear).toBeUndefined();
    expect(read.interpolations[0]).toMatchObject({ property: 'scale', range: [1, 2], binding: 0 });
  });

  it('dupliquer un calque renomme les interpolations de ses formes', () => {
    const element = createElement('ellipse', 0, 0, { interpolations: [createInterpolation()] });
    const layer = createLayer({ elements: [element] });
    const scene = duplicateLayer({ ...createScene(), layers: [layer] }, layer.id);
    const [a, b] = scene.layers.map((l) => l.elements[0].interpolations[0].id);
    expect(a).not.toBe(b);
  });
});

import { offsetPolygon, untangle } from '../src/plane.js';

describe('offsetPolygon ouvert', () => {
  it('décale chaque bout selon sa seule arête', () => {
    const rail = offsetPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2, false);
    expect(Math.abs(rail[0].y)).toBeCloseTo(2);
    expect(rail[0].x).toBeCloseTo(0);
    expect(Math.abs(rail[2].x - 10)).toBeCloseTo(2);
    expect(rail[2].y).toBeCloseTo(10);
  });
});

describe('untangle', () => {
  const arc = (radius, from, to, steps) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const angle = from + ((to - from) * i) / steps;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
  const backwards = (edge, path) =>
    edge.slice(1).filter((p, k) => (p.x - edge[k].x) * (path[k + 1].x - path[k].x) + (p.y - edge[k].y) * (path[k + 1].y - path[k].y) < -1e-9);

  it('un bord intérieur plus décalé que le rayon ne rebrousse plus chemin', () => {
    /* Virage de rayon 5, bord décalé de 8 vers le centre : queue d'aronde. */
    const path = [{ x: -20, y: -5 }, ...arc(5, -Math.PI / 2, Math.PI / 2, 12), { x: -20, y: 5 }];
    const sign = offsetPolygon(path, 1, false)[1].x > path[1].x ? -1 : 1;
    const raw = offsetPolygon(path, 8 * sign, false);
    expect(backwards(raw, path).length).toBeGreaterThan(0);
    const clean = untangle(raw, path, 8 * sign);
    expect(clean).toHaveLength(raw.length);
    expect(backwards(clean, path)).toEqual([]);
  });

  it('un bout pris dans un virage serré garde sa coupe droite, en travers du tracé', () => {
    /* Le tracé démarre et finit dans des virages de rayon 5, bord décalé de 8 vers le centre. */
    const path = [...arc(5, -Math.PI / 2, Math.PI / 2, 12), { x: -20, y: 5 }, ...arc(5, Math.PI / 2, (3 * Math.PI) / 2, 12).map((p) => ({ x: p.x - 25, y: p.y + 10 }))];
    const sign = offsetPolygon(path, 1, false)[1].x > path[1].x ? -1 : 1;
    const clean = untangle(offsetPolygon(path, 8 * sign, false), path, 8 * sign);
    const across = (end, next) => {
      const tangent = { x: path[next].x - path[end].x, y: path[next].y - path[end].y };
      return (clean[end].x - path[end].x) * tangent.x + (clean[end].y - path[end].y) * tangent.y;
    };
    expect(across(0, 1)).toBeCloseTo(0);
    expect(across(path.length - 1, path.length - 2)).toBeCloseTo(0);
  });

  it('deux spires qui se chevauchent restent', () => {
    /* Grande boucle ouverte qui repasse sur son début : le croisement est loin sur le tracé. */
    const path = arc(50, 0, 2.2 * Math.PI, 80);
    const edge = offsetPolygon(path, 3, false);
    expect(untangle(edge, path, 3)).toEqual(edge);
  });
});

import { MAX_NAME_LENGTH, renameElement } from '../src/scene.js';
import { shapeName } from '../src/ui/list.js';

describe('formes nommables', () => {
  const withShapes = () => {
    const next = createScene();
    const layerId = next.activeLayerId;
    return addElement(addElement(next, layerId, 'ellipse', 0, 0), layerId, 'rect', 10, 10);
  };


  it('garde son nom quand on la réordonne ; sans nom, libellé par rang', () => {
    const base = withShapes();
    const { id } = base.layers[0].elements[0];
    const named = renameElement(base, id, '  Soleil ');
    expect(named.layers[0].elements[0].name).toBe('Soleil');
    const layer = moveElement(named, id, 1).layers[0];
    expect(layer.elements.map((element) => shapeName(layer, element, SHAPES))).toEqual([`${SHAPES.rect.label} 1`, 'Soleil']);
  });

  it('un nom vide rend le libellé par défaut, un nom inchangé ne fait rien', () => {
    const base = withShapes();
    const { id } = base.layers[0].elements[0];
    const named = renameElement(base, id, 'Soleil');
    expect(renameElement(named, id, 'Soleil')).toBe(named);
    expect(renameElement(named, id, '   ').layers[0].elements[0]).not.toHaveProperty('name');
    expect(renameElement(base, id, '')).toBe(base);
  });

  it('se sérialise, borné ; un nom invalide est ignoré à la lecture', () => {
    const base = withShapes();
    const named = renameElement(base, base.layers[0].elements[0].id, 'Soleil');
    expect(deserialize(serialize(named)).layers[0].elements[0].name).toBe('Soleil');
    const raw = JSON.parse(serialize(named));
    raw.layers[0].elements[0].name = 42;
    expect(deserialize(JSON.stringify(raw)).layers[0].elements[0]).not.toHaveProperty('name');
    raw.layers[0].elements[0].name = 'x'.repeat(500);
    expect(deserialize(JSON.stringify(raw)).layers[0].elements[0].name).toHaveLength(MAX_NAME_LENGTH);
  });

  it('le format est bumpé, l’ancien reste lisible', () => {
    expect(FORMAT).toBe('vektor/scene@33');
    const raw = JSON.parse(serialize(withShapes()));
    raw.format = 'vektor/scene@29';
    expect(deserialize(JSON.stringify(raw)).layers[0].elements).toHaveLength(2);
  });

  it('l’espacement constant d’une spirale se relit ; tout autre valeur est ignorée', () => {
    const scene = withShapes();
    const layer = { ...scene.layers[0], modifiers: [createModifier({ type: 'spiral', evenSpacing: true })] };
    const raw = JSON.parse(serialize({ ...scene, layers: [layer] }));
    expect(deserialize(JSON.stringify(raw)).layers[0].modifiers[0].evenSpacing).toBe(true);
    raw.layers[0].modifiers[0].evenSpacing = 'oui';
    expect(deserialize(JSON.stringify(raw)).layers[0].modifiers[0]).not.toHaveProperty('evenSpacing');
  });
});

import { booleanPieces } from '../src/plane.js';

describe('booleanPieces : contour double', () => {
  it('bords calculés sur les formes d’origine : pas de boucle au creux de la jonction', () => {
    const a = createElement('ellipse', 0, 0, { rx: 100, ry: 100, outlined: true, gap: 10, strokeWidth: 4 });
    const b = createElement('ellipse', 150, 0, { rx: 100, ry: 100 });
    const [piece, ...rest] = booleanPieces(a, [{ shape: b, op: 'union' }]);
    expect(rest).toEqual([]);
    const [outer, inner] = piece.rims.map((rim) => rim.points);
    const reach = (4 + 10) / 2;
    /* Tout le bord extérieur reste à `reach` au moins des deux cercles (à l'échantillonnage près). */
    const gap = (p, c) => Math.hypot(p.x - c.x, p.y - c.y) - 100;
    expect(Math.min(...outer.map((p) => Math.min(gap(p, a), gap(p, b))))).toBeGreaterThan(reach * 0.9);
    /* Et tout le bord intérieur, dedans à `reach` au moins d'un bord. */
    expect(Math.max(...inner.map((p) => Math.min(gap(p, a), gap(p, b))))).toBeLessThan(-reach * 0.9);
    /* Jonctions = coins, pas les sommets des cercles échantillonnés. */
    expect(piece.rims.map((rim) => rim.corners.length)).toEqual([2, 2]);
  });
});

it('le dessin d’exemple du premier lancement se relit', async () => {
  const { default: example } = await import('../src/example.json?raw');
  expect(deserialize(example).layers[0].elements.length).toBeGreaterThan(0);
});
