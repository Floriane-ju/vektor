import { describe, expect, it } from 'vitest';
import { clampCount, stackValues, t } from '../src/interpolate.js';
import { createModifier, MODIFIERS, orients } from '../src/modifiers.js';
import {
  addBoolean,
  addElement,
  addInterpolation,
  clearInterpolations,
  createElement,
  createInterpolation,
  createLayer,
  dragPatch,
  duplicateElement,
  getRenderedChildren,
  moveElement,
  moveLayer,
  moveModifier,
  recenterTrace,
  removeBoolean,
  removeElement,
  removeInterpolation,
  removeLayer,
  removeModifier,
  rotateVector,
  setLayerStroke,
  setLayerStrokeWidth,
  snapToGrid,
  snapToPolarGrid,
  updateBoolean,
  updateElement,
  updateInterpolation,
  updateInterpolationRange,
} from '../src/scene.js';
import { deserialize, serialize } from '../src/persistence.js';
import { createStore, HISTORY_LIMIT } from '../src/store.js';
import { parseTrace } from '../src/path.js';
import { SHAPES } from '../src/scene.js';

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

  it('spiral tourne et dilate d’un facteur constant', () => {
    const children = copies('spiral', { x: 10, y: 0 }, 4, {
      angleStep: Math.PI / 2,
      radiusStep: 50,
    });
    expect(children.map(dist)).toEqual([10, 15, 22.5, 33.75].map((d) => expect.closeTo(d)));
    expect(children[1].x).toBeCloseTo(0);
    expect(children[1].y).toBeCloseTo(15);
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

  /* L'épaisseur est un facteur de celle du calque, comme l'échelle l'est de la
     taille : 4 → 0,5 va de 4× à la moitié de l'épaisseur du calque. */
  it('une interpolation d’épaisseur affine les copies', () => {
    const thinning = layer({
      strokeWidth: 2,
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
    /* Ni l'épaisseur ni la couleur ne sont sur la forme : elles appartiennent
       au calque. */
    expect(point.strokeWidth).toBeUndefined();
    expect(point.stroke).toBeUndefined();
  });

  it('la couleur du calque borne rien et ne mute pas', () => {
    const scene = withTwo();
    expect(setLayerStroke(scene, scene.layers[0].id, '#ff0000').layers[0].stroke).toBe('#ff0000');
    expect(scene.layers[0].stroke).toBe('#7dd3c0');
  });

  it('l’épaisseur du calque borne à zéro et ne mute pas', () => {
    const scene = withTwo();
    expect(setLayerStrokeWidth(scene, scene.layers[0].id, 4).layers[0].strokeWidth).toBe(4);
    expect(setLayerStrokeWidth(scene, scene.layers[0].id, -3).layers[0].strokeWidth).toBe(0);
    expect(scene.layers[0].strokeWidth).toBe(1.5);
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
    expect(layer.strokeWidth).toBe(10);
    /* La couleur du disque remonte sur le calque, qui la porte désormais. */
    expect(layer.stroke).toBe('#abcdef');
    expect(layer.elements[0]).toMatchObject({ filled: false, rx: 0 });
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
    expect(layer.stroke).toBe('#abcdef');
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

  it('refuse ce qui ne trace pas de segment droit', () => {
    expect(() => parseTrace('M0 0 Q 1 1 2 2')).toThrow(/« Q »/);
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

import { parseDash } from '../src/scene.js';

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
});
