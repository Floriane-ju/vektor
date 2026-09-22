import { describe, expect, it } from 'vitest';
import { clampCount, interpolateProps, t } from '../src/interpolate.js';
import { MODIFIERS } from '../src/modifiers.js';
import {
  addElement,
  createElement,
  createLayer,
  getRenderedChildren,
  moveElement,
  moveLayer,
  removeElement,
  removeLayer,
  setLayerStrokeWidth,
  updateElement,
} from '../src/scene.js';
import { deserialize, serialize } from '../src/persistence.js';

const center = { x: 0, y: 0 };
const dist = (p) => Math.hypot(p.x - center.x, p.y - center.y);
const angle = (p) => Math.atan2(p.y - center.y, p.x - center.x);

/** Les `n` copies produites par un modificateur pour un point donné. */
const copies = (type, point, n, options = {}) =>
  Array.from({ length: n }, (_, i) => MODIFIERS[type](point, i, n, center, options));

describe('interpolation', () => {
  it('répartit une plage linéairement sur les indices', () => {
    const values = [0, 1, 2, 3, 4].map((i) => interpolateProps({ opacity: [1, 0] }, i, 5).opacity);
    expect(values).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it('interpole plusieurs propriétés en une passe', () => {
    expect(interpolateProps({ opacity: [1, 0], scale: [1, 2] }, 1, 3)).toEqual({
      opacity: 0.5,
      scale: 1.5,
    });
  });

  it('garde le cas dégénéré sans NaN', () => {
    expect(t(0, 1)).toBe(0);
    expect(t(0, 0)).toBe(0);
    expect(interpolateProps({ opacity: [1, 0] }, 0, 1).opacity).toBe(1);
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

  it('spiral accroît rayon et angle par pas constants', () => {
    const children = copies('spiral', { x: 10, y: 0 }, 4, {
      angleStep: Math.PI / 2,
      radiusStep: 5,
    });
    expect(children.map(dist).map(Math.round)).toEqual([10, 15, 20, 25]);
    expect(children[1].x).toBeCloseTo(0);
    expect(children[1].y).toBeCloseTo(15);
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
      elements: [createElement('circle', 100, 0)],
      modifier: { type: 'step', n: 5, stepX: -50, stepY: 0, angleStep: 0.4, radiusStep: 12 },
      propertyRanges: { opacity: [1, 0], scale: [1, 1] },
      ...overrides,
    });

  it('applique position puis propriétés interpolées en une passe', () => {
    const children = getRenderedChildren(layer());
    expect(children.map((c) => c.x)).toEqual([100, 50, 0, -50, -100]);
    expect(children.map((c) => c.y)).toEqual([0, 0, 0, 0, 0]);
    expect(children.map((c) => c.opacity)).toEqual([1, 0.75, 0.5, 0.25, 0]);
  });

  it('un calque sans forme ne rend rien', () => {
    expect(getRenderedChildren(createLayer())).toEqual([]);
  });

  it('`none` ignore N et ne rend que les formes du calque', () => {
    const single = layer({ modifier: { type: 'none', n: 9, angleStep: 0, radiusStep: 0 } });
    expect(getRenderedChildren(single)).toHaveLength(1);
  });

  it('un miroir rend deux copies, quel que soit N', () => {
    const mirrored = layer({
      modifier: { type: 'mirrorH', n: 9, stepX: 0, stepY: 0, angleStep: 0, radiusStep: 0 },
    });
    expect(getRenderedChildren(mirrored).map((c) => c.x)).toEqual([100, -100]);
  });

  /* Le cœur du modèle : le modificateur déplace le calque entier, pas chaque
     forme séparément. */
  it('le modificateur transforme le groupe, pas chaque forme isolément', () => {
    const group = layer({
      elements: [createElement('circle', 100, 0), createElement('point', 140, 0)],
      modifier: { type: 'axial', n: 4, angleStep: 0, radiusStep: 0 },
      propertyRanges: { opacity: [1, 0], scale: [1, 1] },
    });
    const children = getRenderedChildren(group);

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

  it('rend n × formes, groupées par copie', () => {
    const group = layer({
      elements: [createElement('circle', 10, 0), createElement('rect', 20, 0)],
      modifier: { type: 'step', n: 3, stepX: 10, stepY: 0, angleStep: 0, radiusStep: 0 },
    });
    expect(getRenderedChildren(group).map((c) => c.type)).toEqual([
      'circle',
      'rect',
      'circle',
      'rect',
      'circle',
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

describe('formes d’un calque', () => {
  const withTwo = () => {
    const layer = createLayer();
    let scene = { layers: [layer], activeLayerId: layer.id, activeElementId: null };
    scene = addElement(scene, layer.id, 'circle', 10, 10);
    scene = addElement(scene, layer.id, 'circle', 20, 20);
    return scene;
  };

  it('ajoute les formes au calque et active la dernière', () => {
    const scene = withTwo();
    expect(scene.layers[0].elements).toHaveLength(2);
    expect(scene.activeElementId).toBe(scene.layers[0].elements[1].id);
  });

  it('une nouvelle forme reprend les couleurs de la forme active', () => {
    let scene = withTwo();
    const active = scene.activeElementId;
    scene = {
      ...scene,
      layers: scene.layers.map((layer) => ({
        ...layer,
        elements: layer.elements.map((element) =>
          element.id === active ? { ...element, stroke: '#ff0000' } : element,
        ),
      })),
    };
    scene = addElement(scene, scene.layers[0].id, 'circle', 30, 30);
    expect(scene.layers[0].elements.at(-1).stroke).toBe('#ff0000');
  });

  it('un type différent reprend les couleurs mais sa propre géométrie', () => {
    let scene = withTwo();
    scene = updateElement(scene, scene.activeElementId, { stroke: '#ff0000' });
    scene = addElement(scene, scene.layers[0].id, 'point', 30, 30);
    const point = scene.layers[0].elements.at(-1);
    expect(point.stroke).toBe('#ff0000');
    expect(point.rx).toBe(0);
    /* L'épaisseur n'est plus sur la forme : elle appartient au calque. */
    expect(point.strokeWidth).toBeUndefined();
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
});

describe('persistance', () => {
  it('un aller-retour JSON reconstruit une scène identique', () => {
    const layer = createLayer({
      elements: [
        createElement('circle', 120, 340, { rx: 42, ry: 42, stroke: '#ff0000' }),
        createElement('rect', 200, 100, { rx: 30, ry: 15 }),
      ],
      modifier: { type: 'spiral', n: 12, stepX: 25, stepY: -10, angleStep: 0.3, radiusStep: 8 },
      propertyRanges: { opacity: [1, 0.2], scale: [0.5, 2] },
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

  it('clampe un N hors bornes au lieu de le propager', () => {
    const raw = JSON.stringify({
      format: 'illu/scene@3',
      layers: [{ id: 'L1', modifier: { type: 'axial', n: -4 } }],
      activeLayerId: 'L1',
    });
    expect(deserialize(raw).layers[0].modifier.n).toBe(1);
  });

  it('replie une plage absente sur la valeur neutre, pas sur une borne', () => {
    const raw = '{"format":"illu/scene@3","layers":[{"id":"L1"}],"activeLayerId":"L1"}';
    expect(deserialize(raw).layers[0].propertyRanges).toEqual({ opacity: [1, 1], scale: [1, 1] });
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
    expect(layer.elements[0]).toMatchObject({ stroke: '#abcdef', fill: 'none', rx: 0 });
  });

  it('relit un projet v1 : `radius` converti, forme unique devenue liste', () => {
    const v1 = JSON.stringify({
      format: 'illu/scene@1',
      layers: [
        {
          id: 'L1',
          name: 'Ancien calque',
          baseElement: { type: 'circle', x: 10, y: 20, radius: 33, stroke: '#abcdef' },
          modifier: { type: 'axial', n: 8 },
        },
      ],
      activeLayerId: 'L1',
    });
    const { elements } = deserialize(v1).layers[0];
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ type: 'circle', x: 10, y: 20, rx: 33, ry: 33 });
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
        { id: 'L1', elements: [{ id: 'E1', type: 'circle', x: 0, y: 0 }] },
        { id: 'L2', elements: [{ id: 'E1', type: 'circle', x: 0, y: 0 }] },
      ],
      activeLayerId: 'L1',
    });
    expect(() => deserialize(duplicateElements)).toThrow(/formes portent le même/);
  });
});
