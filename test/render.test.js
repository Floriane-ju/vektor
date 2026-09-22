// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, toSvgDocument } from '../src/renderer-svg.js';
import { createElement, createInterpolation, createLayer, STAGE } from '../src/scene.js';
import { createStore } from '../src/store.js';
import { mountToolbar } from '../src/ui/toolbar.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const stage = () => {
  const node = document.createElementNS(SVG_NS, 'svg');
  node.id = 'stage';
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', 'Illustration en cours');
  return node;
};

const repeatLayer = (overrides = {}) =>
  createLayer({
    center: { x: 0, y: 0 },
    elements: [createElement('circle', 100, 0)],
    modifiers: [{ type: 'step', n: 5, stepX: -50, stepY: 0, angleStep: 0.4, radiusStep: 12 }],
    ...overrides,
  });

const ramp = (property, range) => createInterpolation({ property, range });

describe('renderer SVG', () => {
  let svg;
  beforeEach(() => {
    svg = stage();
  });

  it('rend les opacités interpolées sur les enfants', () => {
    render(
      { layers: [repeatLayer({ interpolations: [ramp('opacity', [1, 0])] })] },
      svg,
    );
    const circles = [...svg.querySelectorAll('circle')];
    expect(circles).toHaveLength(5);
    expect(circles.map((c) => c.getAttribute('fill-opacity'))).toEqual([
      '1',
      '0.75',
      '0.5',
      '0.25',
      '0',
    ]);
    expect(circles.map((c) => c.getAttribute('stroke-opacity'))).toEqual(
      circles.map((c) => c.getAttribute('fill-opacity')),
    );
  });

  it('multiplie le rayon par l’échelle interpolée', () => {
    const layer = repeatLayer({
      modifiers: [{ type: 'step', n: 3, stepX: 0, stepY: 0, angleStep: 0, radiusStep: 0 }],
      interpolations: [ramp('scale', [1, 2])],
    });
    render({ layers: [layer] }, svg);
    expect([...svg.querySelectorAll('circle')].map((c) => c.getAttribute('r'))).toEqual([
      '60',
      '90',
      '120',
    ]);
  });

  it('un groupe par calque, dans l’ordre du tableau (z-order)', () => {
    const back = repeatLayer({ modifiers: [{ type: 'none', n: 1 }] });
    const front = repeatLayer({ modifiers: [{ type: 'none', n: 1 }] });
    render({ layers: [back, front], activeLayerId: null, activeElementId: null }, svg);
    expect([...svg.querySelectorAll('g')].map((g) => g.dataset.layerId)).toEqual([
      back.id,
      front.id,
    ]);
  });

  it('un calque masqué n’émet aucun nœud', () => {
    render({ layers: [repeatLayer({ visible: false })], activeLayerId: null, activeElementId: null }, svg);
    expect(svg.childNodes).toHaveLength(0);
  });

  it('un re-rendu remplace le contenu au lieu de l’empiler', () => {
    const scene = { layers: [repeatLayer()], activeLayerId: null, activeElementId: null };
    render(scene, svg);
    render(scene, svg);
    expect(svg.querySelectorAll('circle')).toHaveLength(5);
  });
});

describe('repères du modificateur', () => {
  const scene = (layer) => ({ layers: [layer], activeLayerId: layer.id, activeElementId: null });

  it('trace l’axe du miroir, et lui seul', () => {
    const svg = stage();
    const layer = repeatLayer({
      center: { x: 400, y: 300 },
      modifiers: [{ type: 'mirrorH', n: 5, stepX: 0, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    render(scene(layer), svg);
    const guides = svg.querySelector('[data-guides]');
    expect(guides.dataset.guides).toBe('mirrorH');
    const lines = [...guides.querySelectorAll('line')];
    expect(lines).toHaveLength(1);
    expect([lines[0].getAttribute('x1'), lines[0].getAttribute('x2')]).toEqual(['400', '400']);
    expect([lines[0].getAttribute('y1'), lines[0].getAttribute('y2')]).toEqual([
      '0',
      String(STAGE.height),
    ]);
  });

  it('marque le centre de la spirale', () => {
    const svg = stage();
    const layer = repeatLayer({
      center: { x: 400, y: 300 },
      modifiers: [{ type: 'spiral', n: 3, angleStep: 0.4, radiusStep: 12 }],
    });
    render(scene(layer), svg);
    const [horizontal, vertical] = svg.querySelectorAll('[data-guides] line');
    /* Croix centrée : chaque branche s'étend autant de part et d'autre du centre. */
    expect([
      horizontal.getAttribute('x1'),
      horizontal.getAttribute('x2'),
      horizontal.getAttribute('y1'),
      horizontal.getAttribute('y2'),
    ]).toEqual(['386', '414', '300', '300']);
    expect([
      vertical.getAttribute('x1'),
      vertical.getAttribute('x2'),
      vertical.getAttribute('y1'),
      vertical.getAttribute('y2'),
    ]).toEqual(['400', '400', '286', '314']);
    expect(svg.querySelectorAll('[data-guides] circle')).toHaveLength(0);
  });

  it('ne trace rien pour `none` ni pour un pas, ni sans calque actif', () => {
    const svg = stage();
    for (const type of ['none', 'step']) {
      render(scene(repeatLayer({ modifiers: [{ type, n: 6, stepX: 50, stepY: 0 }] })), svg);
      expect(svg.querySelector('[data-guides]')).toBeNull();
    }

    render({ layers: [repeatLayer()], activeLayerId: null, activeElementId: null }, svg);
    expect(svg.querySelector('[data-guides]')).toBeNull();
  });

  it('trace les repères de chaque modificateur de la pile', () => {
    const svg = stage();
    const layer = repeatLayer({
      center: { x: 400, y: 300 },
      modifiers: [
        { type: 'mirrorH', n: 2 },
        { type: 'spiral', n: 3, angleStep: 0.4, radiusStep: 12 },
      ],
    });
    render(scene(layer), svg);
    const guides = svg.querySelector('[data-guides]');
    expect(guides.dataset.guides).toBe('mirrorH spiral');
    /* L'axe du miroir, plus les deux branches du centre de la spirale. */
    expect(guides.querySelectorAll('line')).toHaveLength(3);
  });

  it('laisse les repères hors de l’export', () => {
    const svg = stage();
    render(scene(repeatLayer({ modifiers: [{ type: 'mirrorH', n: 2 }] })), svg);
    expect(svg.querySelector('[data-guides]')).not.toBeNull();
    expect(toSvgDocument(svg)).not.toContain('data-guides');
  });
});

describe('export SVG', () => {
  it('reprend exactement les nœuds affichés', () => {
    const svg = stage();
    render({ layers: [repeatLayer()], activeLayerId: null, activeElementId: null }, svg);
    const document_ = toSvgDocument(svg);

    const preview = [...svg.querySelectorAll('circle')].map((c) => [
      c.getAttribute('cx'),
      c.getAttribute('cy'),
      c.getAttribute('r'),
    ]);
    const exported = [...document_.matchAll(/<circle[^>]*>/g)].map((match) =>
      ['cx', 'cy', 'r'].map((name) => match[0].match(new RegExp(`${name}="([^"]*)"`))?.[1]),
    );
    expect(exported).toEqual(preview);
  });

  it('porte les attributs de document et laisse ceux de l’interface', () => {
    const svg = stage();
    render({ layers: [repeatLayer()], activeLayerId: null, activeElementId: null }, svg);
    const document_ = toSvgDocument(svg);

    expect(document_).toContain(`xmlns="${SVG_NS}"`);
    expect(document_).toContain(`viewBox="0 0 ${STAGE.width} ${STAGE.height}"`);
    expect(document_).toContain(`width="${STAGE.width}"`);
    expect(document_).not.toContain('aria-label');
    expect(document_).not.toContain('id="stage"');
    /* La racine vivante garde ses attributs d'interface : le clone ne la touche pas. */
    expect(svg.id).toBe('stage');
    expect(svg.getAttribute('aria-label')).toBe('Illustration en cours');
  });
});

describe('dessin au glisser', () => {
  /* La conversion écran → viewBox appartient au navigateur ; on neutralise la
     CTM pour vérifier ce qui est à nous : lecture du geste et câblage au store. */
  const prepare = (svg) => {
    globalThis.DOMPoint = class {
      constructor(x, y) {
        Object.assign(this, { x, y });
      }
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    };
    svg.getScreenCTM = () => ({ inverse: () => ({}) });
  };

  const pointer = (svg, type, x, y) =>
    svg.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }),
    );

  const mount = (scene) => {
    const store = createStore(scene);
    const svg = stage();
    const shapes = document.createElement('div');
    const messages = [];
    prepare(svg);
    mountToolbar({
      store,
      svgRoot: svg,
      container: document.createElement('div'),
      shapeContainer: shapes,
      status: { show: (message, tone) => messages.push([message, tone]) },
    });
    return { store, svg, shapes, messages };
  };

  const withLayer = () => {
    const layer = createLayer();
    return mount({ layers: [layer], activeLayerId: layer.id });
  };

  /* On passe par le radio, comme le ferait l'utilisateur, plutôt que par une
     API interne du module. */
  const pick = (shapes, type) => {
    const radio = shapes.querySelector(`#shape-${type}`);
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  };

  it('le glissement prend le point de départ pour centre et la distance pour taille', () => {
    const { store, svg } = withLayer();
    pointer(svg, 'pointerdown', 400, 300);
    pointer(svg, 'pointermove', 400, 350);
    pointer(svg, 'pointerup', 400, 350);

    expect(store.get().layers[0].elements.at(-1)).toMatchObject({
      type: 'circle',
      x: 400,
      y: 300,
      rx: 50,
      ry: 50,
    });
  });

  it('l’aperçu suit le curseur pendant le geste', () => {
    const { store, svg } = withLayer();
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointermove', 100, 120);
    expect(store.get().layers[0].elements.at(-1).rx).toBe(20);
    pointer(svg, 'pointermove', 100, 180);
    expect(store.get().layers[0].elements.at(-1).rx).toBe(80);
    pointer(svg, 'pointerup', 100, 180);
  });

  it('un clic sans glissement pose la taille par défaut du type', () => {
    const { store, svg } = withLayer();
    pointer(svg, 'pointerdown', 450, 450);
    pointer(svg, 'pointerup', 451, 450);

    expect(store.get().layers[0].elements.at(-1)).toMatchObject({ rx: 60, ry: 60 });
  });

  it('le rectangle prend deux dimensions indépendantes', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'rect');
    pointer(svg, 'pointerdown', 300, 300);
    pointer(svg, 'pointerup', 380, 320);

    expect(store.get().layers[0].elements.at(-1)).toMatchObject({
      type: 'rect',
      rx: 80,
      ry: 20,
    });
  });

  it('le glissement pose le point sans lui donner d’étendue', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'point');
    pointer(svg, 'pointerdown', 200, 200);
    pointer(svg, 'pointerup', 230, 240);

    const element = store.get().layers[0].elements.at(-1);
    expect(element).toMatchObject({ type: 'point', x: 200, y: 200, rx: 0, ry: 0 });
  });

  it('la ligne se trace d’un bout à l’autre du geste, centrée en son milieu', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'line');
    pointer(svg, 'pointerdown', 100, 200);
    pointer(svg, 'pointerup', 300, 100);

    /* Le geste monte : `ry` reste négatif, sans quoi la ligne redescendrait. */
    expect(store.get().layers[0].elements.at(-1)).toMatchObject({
      type: 'line',
      x: 200,
      y: 150,
      rx: 100,
      ry: -50,
    });
  });

  it('un clic sans glissement pose une ligne horizontale par défaut', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'line');
    pointer(svg, 'pointerdown', 400, 400);
    pointer(svg, 'pointerup', 401, 400);

    expect(store.get().layers[0].elements.at(-1)).toMatchObject({ rx: 60, ry: 0 });
  });

  it('changer de type garde le remplissage et prend la géométrie du nouveau', () => {
    const { store, svg, shapes } = withLayer();
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointerup', 100, 160);
    const circle = store.get().layers[0].elements.at(-1);

    pick(shapes, 'point');
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointerup', 100, 160);
    const point = store.get().layers[0].elements.at(-1);
    expect(point.filled).toBe(circle.filled);
    expect(point.rx).toBe(0);
    /* Ni l'épaisseur ni la couleur ne suivent la forme : elles sont réglées
       sur le calque. */
    expect(point.strokeWidth).toBeUndefined();
    expect(point.stroke).toBeUndefined();
  });

  it('refuse sans calque actif et le signale', () => {
    const { store, svg, messages } = mount({ layers: [], activeLayerId: null, activeElementId: null });
    pointer(svg, 'pointerdown', 10, 10);
    pointer(svg, 'pointerup', 60, 60);

    expect(store.get().layers).toEqual([]);
    expect(messages[0][1]).toBe('error');
  });
});

describe('outil curseur', () => {
  const mountWithShape = () => {
    const layer = createLayer({ elements: [createElement('circle', 100, 100, { filled: true })] });
    const other = createLayer();
    const store = createStore({ layers: [layer, other], activeLayerId: other.id, activeElementId: null });
    const svg = stage();
    globalThis.DOMPoint = class {
      constructor(x, y) {
        Object.assign(this, { x, y });
      }
      matrixTransform() {
        return { x: this.x, y: this.y };
      }
    };
    svg.getScreenCTM = () => ({ inverse: () => ({}) });
    const shapes = document.createElement('div');
    render(store.get(), svg);
    store.subscribe((next) => render(next, svg));
    mountToolbar({
      store,
      svgRoot: svg,
      container: document.createElement('div'),
      shapeContainer: shapes,
      status: { show: () => {} },
    });
    const radio = shapes.querySelector('#shape-cursor');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    return { store, svg, layer };
  };

  const on = (node, type, x = 0, y = 0) =>
    node.dispatchEvent(new MouseEvent(type, { button: 0, bubbles: true, clientX: x, clientY: y }));

  it('glisser une forme la déplace du même écart que le pointeur', () => {
    const { store, svg } = mountWithShape();
    on(svg.querySelector('circle'), 'pointerdown', 100, 100);
    on(svg, 'pointermove', 130, 90);
    on(svg, 'pointerup', 150, 80);

    expect(store.get().layers[0].elements).toHaveLength(1);
    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 150, y: 80, rx: 60 });
  });

  it('glisser ailleurs dans le dessin déplace la forme sélectionnée', () => {
    const { store, svg, layer } = mountWithShape();
    on(svg.querySelector('circle'), 'pointerdown', 100, 100);
    on(svg, 'pointerup', 100, 100);

    on(svg, 'pointermove', 600, 600);
    /* Tout le dessin déplace la sélection : il prend le curseur de saisie. */
    expect(svg.hasAttribute('data-has-selection')).toBe(true);
    on(svg, 'pointerdown', 600, 600);
    on(svg, 'pointermove', 640, 610);
    expect(svg.hasAttribute('data-dragging')).toBe(true);
    on(svg, 'pointerup', 640, 610);
    expect(svg.hasAttribute('data-dragging')).toBe(false);

    expect(store.get().activeElementId).toBe(layer.elements[0].id);
    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 140, y: 110 });
  });

  it('le survol pose une copie de la forme par-dessus, sans la dessiner', () => {
    const { svg } = mountWithShape();
    const circle = svg.querySelector('circle');
    on(circle, 'pointermove');

    const overlay = svg.querySelector('[data-hover]');
    expect(overlay.tagName.toLowerCase()).toBe('circle');
    expect(overlay.getAttribute('r')).toBe(circle.getAttribute('r'));
    expect(svg.lastElementChild).toBe(overlay);
    expect(toSvgDocument(svg)).not.toContain('data-hover');

    on(svg, 'pointermove');
    expect(svg.querySelector('[data-hover]')).toBeNull();
  });

  it('la forme sélectionnée reste surlignée quand le pointeur survole le reste du dessin', () => {
    const { store, svg, layer } = mountWithShape();
    on(svg.querySelector('circle'), 'pointerdown', 100, 100);
    on(svg, 'pointerup', 100, 100);
    on(svg, 'pointermove', 600, 600);

    const overlays = svg.querySelectorAll('[data-hover]');
    expect(overlays.length).toBeGreaterThan(0);
    expect(store.get().activeElementId).toBe(layer.elements[0].id);
    expect([...overlays].every((node) => node.tagName.toLowerCase() === 'circle')).toBe(true);
  });

  it('un clic sélectionne la forme et son calque, sans en créer', () => {
    const { store, svg, layer } = mountWithShape();
    on(svg.querySelector('circle'), 'pointerdown');

    expect(store.get()).toMatchObject({
      activeLayerId: layer.id,
      activeElementId: layer.elements[0].id,
    });
    expect(store.get().layers[0].elements).toHaveLength(1);

    on(svg, 'pointerup');
    /* Un clic dans le vide, sans glissement, désélectionne. */
    on(svg, 'pointerdown');
    on(svg, 'pointerup');
    expect(store.get().activeElementId).toBeNull();
    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 100, y: 100 });
  });
});

describe('survol depuis la liste des formes', () => {
  it('surligne toutes les copies de la forme survolée, puis les retire', async () => {
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('circle', 10, 10), createElement('rect', 50, 50)],
      modifiers: [{ type: 'step', n: 3, stepX: 10, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const svg = stage();
    render(store.get(), svg);
    const list = document.createElement('div');
    mountShapeList({ store, container: list, svgRoot: svg, status: { show: () => {} } });

    const row = list.querySelector(`[data-focus-key="name-${layer.elements[0].id}"]`).closest('li');
    row.dispatchEvent(new MouseEvent('pointerenter'));
    const overlays = svg.querySelectorAll('[data-hover]');
    expect(overlays).toHaveLength(3);
    expect([...overlays].every((node) => node.tagName.toLowerCase() === 'circle')).toBe(true);
    expect(toSvgDocument(svg)).not.toContain('data-hover');

    row.dispatchEvent(new MouseEvent('pointerleave'));
    expect(svg.querySelectorAll('[data-hover]')).toHaveLength(0);
  });
});

describe('rendu des formes', () => {
  it('toutes les formes d’un calque portent l’épaisseur du calque', () => {
    const svg = stage();
    const layer = createLayer({
      strokeWidth: 7,
      center: { x: 0, y: 0 },
      elements: [createElement('circle', 10, 10), createElement('rect', 50, 50)],
      modifiers: [{ type: 'step', n: 2, stepX: 10, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const widths = [...svg.querySelectorAll('circle, rect')].map((node) =>
      node.getAttribute('stroke-width'),
    );
    expect(widths).toEqual(['7', '7', '7', '7']);
  });

  it('toutes les formes d’un calque portent sa couleur, remplissage compris', () => {
    const svg = stage();
    const layer = createLayer({
      stroke: '#ff0000',
      center: { x: 0, y: 0 },
      elements: [
        createElement('circle', 10, 10),
        createElement('rect', 50, 50, { filled: true }),
      ],
      modifiers: [{ type: 'none', n: 1, angleStep: 0, radiusStep: 0 }],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const [circle, rect] = svg.querySelectorAll('circle, rect');
    expect([circle, rect].map((node) => node.getAttribute('stroke'))).toEqual([
      '#ff0000',
      '#ff0000',
    ]);
    /* Rempli, une forme se peint de la couleur du calque ; sinon rien. */
    expect(circle.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('fill')).toBe('#ff0000');
  });

  it('émet le nœud SVG correspondant à la géométrie', () => {
    const svg = stage();
    const shaped = (type, extra = {}) =>
      createLayer({
        center: { x: 0, y: 0 },
        elements: [createElement(type, 100, 50, { rx: 40, ry: 20, ...extra })],
        modifiers: [{ type: 'none', n: 1, angleStep: 0, radiusStep: 0 }],
      });

    render({ layers: [shaped('circle'), shaped('point'), shaped('rect')], activeElementId: null }, svg);

    expect(svg.querySelectorAll('circle')).toHaveLength(1);
    /* Le point est un trait nul à bout rond : son diamètre est l'épaisseur. */
    const dot = svg.querySelector('line');
    expect(dot.getAttribute('x1')).toBe(dot.getAttribute('x2'));
    expect(dot.getAttribute('stroke-linecap')).toBe('round');
    const rect = svg.querySelector('rect');
    /* rx/ry sont des demi-extensions depuis le centre : le <rect> se replace
       par son coin supérieur gauche. */
    expect([...['x', 'y', 'width', 'height']].map((a) => rect.getAttribute(a))).toEqual([
      '60',
      '30',
      '80',
      '40',
    ]);
  });

  it('la ligne va d’un bout à l’autre de ses demi-extensions signées', () => {
    const svg = stage();
    const layer = createLayer({
      elements: [createElement('line', 100, 100, { rx: 40, ry: -30 })],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);

    const line = svg.querySelector('line');
    expect([
      line.getAttribute('x1'),
      line.getAttribute('y1'),
      line.getAttribute('x2'),
      line.getAttribute('y2'),
    ]).toEqual(['60', '130', '140', '70']);
  });

  it('l’échelle étire la ligne depuis son milieu', () => {
    const svg = stage();
    const layer = createLayer({
      elements: [createElement('line', 100, 0, { rx: 40, ry: 0 })],
      modifiers: [{ type: 'mirrorH', n: 2, angleStep: 0, radiusStep: 0 }],
      center: { x: 100, y: 0 },
      interpolations: [ramp('scale', [1, 2])],
    });
    render({ layers: [layer] }, svg);

    const lines = [...svg.querySelectorAll('line')];
    expect(lines.map((l) => [l.getAttribute('x1'), l.getAttribute('x2')])).toEqual([
      ['60', '140'],
      ['20', '180'],
    ]);
  });

  it('l’échelle interpolée agit sur les deux dimensions du rectangle', () => {
    const svg = stage();
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('rect', 0, 0, { rx: 10, ry: 5 })],
      modifiers: [{ type: 'step', n: 3, stepX: 0, stepY: 0, angleStep: 0, radiusStep: 0 }],
      interpolations: [ramp('scale', [1, 3])],
    });
    render({ layers: [layer] }, svg);

    expect([...svg.querySelectorAll('rect')].map((r) => r.getAttribute('width'))).toEqual([
      '20',
      '40',
      '60',
    ]);
    expect([...svg.querySelectorAll('rect')].map((r) => r.getAttribute('height'))).toEqual([
      '10',
      '20',
      '30',
    ]);
  });
});

describe('sauvegarde locale', () => {
  it('distingue « aucune sauvegarde » d’« une sauvegarde illisible »', async () => {
    const { loadLocal, saveLocal } = await import('../src/persistence.js');
    const KEY = 'illu:scene:v1';

    localStorage.removeItem(KEY);
    expect(loadLocal()).toEqual({ scene: null, error: null });

    localStorage.setItem(KEY, '{ pas du json');
    const corrupted = loadLocal();
    expect(corrupted.scene).toBeNull();
    expect(corrupted.error).toMatch(/JSON valide/);

    saveLocal({ layers: [repeatLayer()], activeLayerId: null, activeElementId: null });
    expect(loadLocal().error).toBeNull();
    expect(loadLocal().scene.layers).toHaveLength(1);
    localStorage.removeItem(KEY);
  });
});

describe('accessibilité au clavier', () => {
  it('le bouton icône garde le focus après reconstruction du panneau', async () => {
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const [bottom, middle, top] = [repeatLayer(), repeatLayer(), repeatLayer()];
    const store = createStore({ layers: [bottom, middle, top], activeLayerId: bottom.id, activeElementId: null });
    const panel = document.createElement('div');
    document.body.append(panel);
    mountLayerPanel({ store, container: panel, status: { show: () => {} } });

    const up = panel.querySelector(`[data-focus-key="up-${bottom.id}"]`);
    up.focus();
    up.click();

    expect(store.get().layers).toEqual([middle, bottom, top]);
    expect(document.activeElement.dataset.focusKey).toBe(`up-${bottom.id}`);

    /* Second clic : le calque atteint le sommet, son « ↑ » se désactive et le
       focus se rabat sur sa propre ligne au lieu de quitter la liste. */
    document.activeElement.click();
    expect(document.activeElement.dataset.focusKey).toBe(`name-${bottom.id}`);
    panel.remove();
  });

  it('la suppression confirmée rend le focus au bouton d’ajout', async () => {
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const layer = repeatLayer();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const panel = document.createElement('div');
    document.body.append(panel);
    mountLayerPanel({ store, container: panel, status: { show: () => {} } });

    const remove = panel.querySelector(`[data-focus-key="delete-${layer.id}"]`);
    remove.focus();
    remove.click();

    /* Le bouton « Sûr ? » a remplacé « × » au même endroit et garde le focus :
       la confirmation se fait sans retourner chercher le bouton à la souris. */
    expect(document.activeElement.dataset.focusKey).toBe(`delete-${layer.id}`);
    document.activeElement.click();

    expect(store.get().layers).toHaveLength(0);
    expect(document.activeElement.dataset.focusKey).toBe('add-layer');
    panel.remove();
  });

  it('ajoute une interpolation au calque, la lie à un étage et la retire', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { addModifier, createLayer } = await import('../src/scene.js');
    const layer = createLayer();
    const store = createStore({
      layers: [layer],
      activeLayerId: layer.id,
      activeElementId: null,
    });
    const panel = document.createElement('div');
    document.body.append(panel);
    panel.append(mountPropertyPanel({ store }).layerDetail);

    store.apply(addModifier, layer.id);
    store.apply(addModifier, layer.id);

    panel.querySelector('[data-focus-key="add-interpolation"]').click();
    const stack = () => store.get().layers[0].interpolations;
    expect(stack()).toHaveLength(1);
    const { id } = stack()[0];

    const block = () => panel.querySelector('.interpolation-block');
    const [property, binding] = block().querySelectorAll('select');

    property.value = 'scale';
    property.dispatchEvent(new Event('change'));
    /* Changer de propriété change les bornes : la plage repart de celle-ci. */
    expect(stack()[0]).toMatchObject({ property: 'scale', range: [1, 0.4] });

    /* Les étages sont nommés par leur rang et leur type : « le deuxième pas »
       se choisit sans compter les blocs à l'écran. */
    expect([...binding.options].map((option) => option.textContent)).toEqual([
      'Toutes les copies',
      '1. Pas',
      '2. Pas',
    ]);
    binding.value = '1';
    binding.dispatchEvent(new Event('change'));
    expect(stack()[0].binding).toBe(1);

    const [start] = block().querySelectorAll('input[type="range"]');
    start.focus();
    start.value = '0.2';
    start.dispatchEvent(new Event('input'));
    expect(stack()[0].range[0]).toBeCloseTo(0.2);
    /* Un curseur réglé en plein glissement garde le focus : le bloc ne s'est
       pas reconstruit sous la souris. */
    expect(document.activeElement).toBe(start);

    const remove = panel.querySelector(`[data-focus-key="delete-interpolation${id}"]`);
    remove.focus();
    remove.click();
    expect(stack()).toEqual([]);
    /* Le focus retombe sur le bouton d'ajout, pas en haut de la page. */
    expect(document.activeElement.dataset.focusKey).toBe('add-interpolation');
    panel.remove();
  });

  it('la forme s’ajoute et se positionne sans souris', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const { createLayer } = await import('../src/scene.js');
    const layer = createLayer();
    const store = createStore({
      layers: [layer],
      activeLayerId: layer.id,
      activeElementId: null,
    });
    const shapeList = document.createElement('div');
    const { shapeDetail } = mountPropertyPanel({ store });
    mountShapeList({ store, container: shapeList, status: { show: () => {} }, detail: shapeDetail });

    expect(store.get().layers[0].elements).toHaveLength(0);

    /* Le glissement sur le plan de travail n'a pas d'équivalent clavier : ce
       bouton est le seul chemin vers la création d'une forme sans souris. */
    shapeList.querySelector('[data-focus-key="add-shape"]').click();
    expect(store.get().layers[0].elements).toHaveLength(1);

    /* La forme ajoutée est sélectionnée : sa card s'ouvre sur ses réglages. */
    const [x, y] = shapeList.querySelectorAll('input[type="number"]');
    x.value = '210';
    x.dispatchEvent(new Event('change'));
    y.value = '340';
    y.dispatchEvent(new Event('change'));

    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 210, y: 340 });
  });

  it('les réglages suivent la card sélectionnée, sans reconstruire la liste', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const { createLayer, setActiveLayer } = await import('../src/scene.js');
    const [bottom, top] = [createLayer(), createLayer()];
    const store = createStore({ layers: [bottom, top], activeLayerId: bottom.id, activeElementId: null });
    const panel = document.createElement('div');
    document.body.append(panel);
    const { layerDetail } = mountPropertyPanel({ store });
    mountLayerPanel({ store, container: panel, status: { show: () => {} }, detail: layerDetail });

    const cardOf = (layer) =>
      panel.querySelector(`[data-focus-key="name-${layer.id}"]`).closest('li');
    expect(cardOf(bottom).contains(layerDetail)).toBe(true);
    expect(cardOf(top).querySelector('fieldset')).toBeNull();

    /* Un champ réglé en pleine saisie reste en place, focus compris. */
    const thickness = layerDetail.querySelector('input[type="number"]');
    thickness.focus();
    thickness.value = '4';
    thickness.dispatchEvent(new Event('input'));
    expect(store.get().layers[0].strokeWidth).toBe(4);
    expect(document.activeElement).toBe(thickness);
    expect(cardOf(bottom).contains(thickness)).toBe(true);

    store.apply(setActiveLayer, top.id);
    expect(cardOf(top).contains(layerDetail)).toBe(true);
    expect(cardOf(bottom).querySelector('fieldset')).toBeNull();
    panel.remove();
  });
  it('un clic sur l’entête de la card sélectionnée la replie, sans la désélectionner', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const { addElement, createLayer } = await import('../src/scene.js');
    const layer = createLayer();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    store.apply(addElement, layer.id, 'rect', 10, 10);
    const panel = document.createElement('div');
    const shapeList = document.createElement('div');
    const { layerDetail, shapeDetail } = mountPropertyPanel({ store });
    mountLayerPanel({ store, container: panel, status: { show: () => {} }, detail: layerDetail });
    mountShapeList({ store, container: shapeList, status: { show: () => {} }, detail: shapeDetail });

    for (const [container, detail, id, activeKey] of [
      [panel, layerDetail, layer.id, 'activeLayerId'],
      [shapeList, shapeDetail, store.get().activeElementId, 'activeElementId'],
    ]) {
      const header = () => container.querySelector(`[data-focus-key="name-${id}"]`);
      expect(header().closest('li').contains(detail)).toBe(true);
      expect(header().getAttribute('aria-expanded')).toBe('true');

      header().click();
      expect(store.get()[activeKey]).toBe(id);
      expect(header().closest('li').contains(detail)).toBe(false);
      expect(header().getAttribute('aria-expanded')).toBe('false');

      header().click();
      expect(header().closest('li').contains(detail)).toBe(true);
    }
  });
});
