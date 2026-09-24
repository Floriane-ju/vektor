// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { areaPath, childBounds, render, toSvgDocument } from '../src/renderer-svg.js';
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
    elements: [createElement('ellipse', 100, 0)],
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
    const circles = [...svg.querySelectorAll('ellipse')];
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
    expect([...svg.querySelectorAll('ellipse')].map((c) => c.getAttribute('rx'))).toEqual([
      '80',
      '120',
      '160',
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
    expect(svg.querySelectorAll('ellipse')).toHaveLength(5);
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
    const lines = [...guides.querySelectorAll('line:not([data-grip])')];
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
    const [horizontal, vertical] = svg.querySelectorAll('[data-guides] line:not([data-grip])');
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
    expect(svg.querySelectorAll('[data-guides] circle:not([data-grip])')).toHaveLength(0);
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
    expect(guides.querySelectorAll('line:not([data-grip])')).toHaveLength(3);
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

    const preview = [...svg.querySelectorAll('ellipse')].map((c) => [
      c.getAttribute('cx'),
      c.getAttribute('cy'),
      c.getAttribute('rx'),
    ]);
    const exported = [...document_.matchAll(/<ellipse[^>]*>/g)].map((match) =>
      ['cx', 'cy', 'rx'].map((name) => match[0].match(new RegExp(`${name}="([^"]*)"`))?.[1]),
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

  it('laisse le style et les marqueurs d’écran hors du fichier', () => {
    const svg = stage();
    render({ layers: [repeatLayer()], activeLayerId: null, activeElementId: null }, svg);
    svg.style.width = '7200px';
    svg.style.backgroundImage = 'url("data:image/svg+xml,grille")';
    svg.dataset.tool = 'draw';
    svg.dataset.grid = '';
    svg.querySelector('ellipse').setAttribute('pointer-events', 'visible');
    const document_ = toSvgDocument(svg);

    expect(document_).not.toContain('style=');
    expect(document_).not.toContain('data-');
    expect(document_).not.toContain('pointer-events');
    expect(document_).not.toContain('opacity="1"');
    /* L'écran garde tout. */
    expect(svg.style.width).toBe('7200px');
    expect(svg.querySelector('[data-element-id]')).not.toBeNull();
  });
});

describe('copie du SVG', () => {
  const mount = () => {
    const layer = repeatLayer();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const svg = stage();
    render(store.get(), svg);
    const container = document.createElement('div');
    const messages = [];
    mountToolbar({ store, svgRoot: svg, container, status: { show: (message, tone) => messages.push([message, tone]) } });
    const item = (label) => [...container.querySelectorAll('.menu-item')].find((node) => node.textContent === label);
    return { svg, item, messages };
  };

  it('met le document dans le presse-papier', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { svg, item, messages } = mount();
    item('Copier le SVG').click();
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(writeText).toHaveBeenCalledWith(toSvgDocument(svg));
    expect(messages[0]).toEqual(['SVG copié dans le presse-papier.', undefined]);
    vi.unstubAllGlobals();
  });

  it('dit quand le presse-papier est refusé', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.reject(new Error('denied')) } });
    const { item, messages } = mount();
    item('Copier le SVG').click();
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0][1]).toBe('error');
    vi.unstubAllGlobals();
  });

  it('propose le PNG aux trois échelles', () => {
    const { item } = mount();
    for (const scale of [1, 2, 4]) expect(item(`Exporter en PNG ${scale}×`)).toBeTruthy();
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

  it('un glissement à l’outil arc pose un secteur du rayon du geste', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'arc');
    pointer(svg, 'pointerdown', 400, 300);
    pointer(svg, 'pointermove', 430, 340);
    pointer(svg, 'pointerup', 430, 340);
    expect(store.get().layers[0].elements.at(-1)).toMatchObject({
      type: 'arc',
      x: 400,
      y: 300,
      rx: 50,
      start: 0,
      end: 180,
      closure: 'sector',
    });
  });

  it('le glissement prend le point de départ pour centre et la distance pour taille', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'polygon');
    pointer(svg, 'pointerdown', 400, 300);
    pointer(svg, 'pointermove', 400, 350);
    pointer(svg, 'pointerup', 400, 350);

    expect(store.get().layers[0].elements.at(-1)).toMatchObject({
      type: 'polygon',
      x: 400,
      y: 300,
      rx: 50,
      ry: 50,
    });
  });

  it('l’aperçu suit le curseur pendant le geste', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'polygon');
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

    expect(store.get().layers[0].elements.at(-1)).toMatchObject({ rx: 80, ry: 45 });
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

  it('l’ellipse prend deux demi-axes indépendants, ronde sous Maj', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'ellipse');
    pointer(svg, 'pointerdown', 300, 300);
    pointer(svg, 'pointerup', 380, 330);
    expect(store.get().layers[0].elements.at(-1)).toMatchObject({ type: 'ellipse', rx: 80, ry: 30 });

    pointer(svg, 'pointerdown', 300, 300);
    svg.dispatchEvent(new MouseEvent('pointerup', { clientX: 380, clientY: 330, button: 0, shiftKey: true }));
    const circle = store.get().layers[0].elements.at(-1);
    expect(circle.rx).toBe(circle.ry);
  });

  it('le polygone prend la distance du geste pour rayon et garde ses côtés', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'polygon');
    pointer(svg, 'pointerdown', 300, 300);
    pointer(svg, 'pointerup', 300, 350);
    expect(store.get().layers[0].elements.at(-1)).toMatchObject({
      type: 'polygon',
      rx: 50,
      sides: 6,
      inner: 100,
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

  it('crée un calque quand il n’y en a aucun', () => {
    const { store, svg } = mount({ layers: [], activeLayerId: null, activeElementId: null });
    pointer(svg, 'pointerdown', 10, 10);
    pointer(svg, 'pointerup', 60, 60);

    const [layer] = store.get().layers;
    expect(store.get().activeLayerId).toBe(layer.id);
    expect(layer.elements).toHaveLength(1);
  });
});

describe('outil curseur', () => {
  const mountWithShape = (overrides = {}) => {
    const layer = createLayer({ elements: [createElement('ellipse', 100, 100, { filled: true })], ...overrides });
    const other = createLayer();
    /* Des modificateurs : le calque est actif, pour que ses repères se tracent. */
    const activeLayerId = overrides.modifiers ? layer.id : other.id;
    const store = createStore({ layers: [layer, other], activeLayerId, activeElementId: null });
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
    on(svg.querySelector('ellipse'), 'pointerdown', 100, 100);
    on(svg, 'pointermove', 130, 90);
    on(svg, 'pointerup', 150, 80);

    expect(store.get().layers[0].elements).toHaveLength(1);
    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 150, y: 80, rx: 80 });
  });

  it('glisser ailleurs dans le dessin déplace la forme sélectionnée', () => {
    const { store, svg, layer } = mountWithShape();
    on(svg.querySelector('ellipse'), 'pointerdown', 100, 100);
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

  it('glisser la croix déplace le pivot du calque, sans saut au départ', () => {
    const { store, svg } = mountWithShape({
      center: { x: 400, y: 300 },
      modifiers: [{ type: 'axial', n: 4 }],
    });
    on(svg.querySelector('[data-pivot] [data-grip]'), 'pointerdown', 405, 302);
    on(svg, 'pointermove', 425, 312);
    on(svg, 'pointerup', 455, 342);
    expect(store.get().layers[0].center).toEqual({ x: 450, y: 340 });
    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 100, y: 100 });
    expect(svg.querySelector('[data-pivot] line').getAttribute('y1')).toBe('340');
  });

  it('un étage à pivot propre déplace le sien ; l’axe d’un miroir ne bouge que sur x', () => {
    const { store, svg } = mountWithShape({
      center: { x: 400, y: 300 },
      modifiers: [
        { type: 'mirrorH', n: 2, center: { x: 100, y: 50 } },
        { type: 'mirrorV', n: 2 },
      ],
    });
    on(svg.querySelector('[data-pivot="0"] [data-grip]'), 'pointerdown', 100, 200);
    on(svg, 'pointerup', 130, 260);
    const [layer] = store.get().layers;
    expect(layer.modifiers[0].center).toEqual({ x: 130, y: 50 });
    expect(layer.center).toEqual({ x: 400, y: 300 });

    on(svg.querySelector('[data-pivot="1"] [data-grip]'), 'pointerdown', 10, 300);
    on(svg, 'pointerup', 70, 320);
    expect(store.get().layers[0].center).toEqual({ x: 400, y: 320 });
  });

  it('survoler une forme non sélectionnée ne la surligne pas', () => {
    const { svg } = mountWithShape();
    on(svg.querySelector('ellipse'), 'pointermove');
    expect(svg.querySelector('[data-hover]')).toBeNull();
  });

  it('la forme sélectionnée porte un contour, sans changer sa peinture', () => {
    const { store, svg, layer } = mountWithShape();
    const circle = svg.querySelector('ellipse');
    const paint = ['fill', 'stroke', 'fill-opacity', 'stroke-opacity'].map((a) => circle.getAttribute(a));
    on(circle, 'pointerdown', 100, 100);
    on(svg, 'pointerup', 100, 100);

    expect(store.get().activeElementId).toBe(layer.elements[0].id);
    expect(svg.querySelectorAll('[data-selection]')).toHaveLength(1);
    const source = svg.querySelector('[data-element-id]');
    expect(['fill', 'stroke', 'fill-opacity', 'stroke-opacity'].map((a) => source.getAttribute(a))).toEqual(paint);
    expect(svg.querySelector('[data-hover]')).toBeNull();
    expect(toSvgDocument(svg)).not.toContain('data-selection');
  });

  it('un clic sélectionne la forme et son calque, sans en créer', () => {
    const { store, svg, layer } = mountWithShape();
    on(svg.querySelector('ellipse'), 'pointerdown');

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

describe('cadre de sélection', () => {
  it('la boîte d’un rectangle tourné de 90° échange ses côtés, épaisseur comprise', () => {
    const box = childBounds({ ...createElement('rect', 100, 100, { rx: 40, ry: 10, rotation: 90 }), strokeWidth: 4 });
    expect(box.minX).toBeCloseTo(88);
    expect(box.maxX).toBeCloseTo(112);
    expect(box.minY).toBeCloseTo(58);
    expect(box.maxY).toBeCloseTo(142);
  });

  it('sans forme sélectionnée, le calque actif est encadré en entier, hors export', () => {
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('ellipse', 100, 100, { rx: 10, ry: 10 })],
      modifiers: [{ type: 'step', n: 3, stepX: 100, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    const svg = stage();
    render({ layers: [layer], activeLayerId: layer.id, activeElementId: null }, svg);
    const frame = svg.querySelector('[data-selection="layer"]');
    const half = layer.strokeWidth / 2;
    /* Trois copies de 100 en 100 : de 90 à 310, plus la demi-épaisseur et l'écart. */
    expect(Number(frame.getAttribute('width'))).toBeCloseTo(220 + 2 * half + 16);
    expect(toSvgDocument(svg)).not.toContain('data-selection');
  });
});

describe('survol depuis la liste des formes', () => {
  it('encadre la seule copie source de la forme survolée, puis retire le cadre', async () => {
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('ellipse', 10, 10), createElement('rect', 50, 50)],
      modifiers: [{ type: 'step', n: 3, stepX: 10, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const svg = stage();
    render(store.get(), svg);
    const list = document.createElement('div');
    mountShapeList({ store, container: list, svgRoot: svg, status: { show: () => {} } });

    const row = list.querySelector(`[data-focus-key="name-${layer.elements[0].id}"]`).closest('li');
    row.dispatchEvent(new MouseEvent('pointerenter'));
    const outlines = svg.querySelectorAll('[data-hover]');
    expect(outlines).toHaveLength(1);
    /* Cadre centré sur la copie source (x = 10), pas sur les copies décalées. */
    const frame = outlines[0];
    expect(frame.tagName.toLowerCase()).toBe('rect');
    expect(Number(frame.getAttribute('x')) + Number(frame.getAttribute('width')) / 2).toBeCloseTo(10);
    expect(Number(frame.getAttribute('y')) + Number(frame.getAttribute('height')) / 2).toBeCloseTo(10);
    expect(toSvgDocument(svg)).not.toContain('data-hover');

    vi.useFakeTimers();
    row.dispatchEvent(new MouseEvent('pointerleave'));
    vi.runAllTimers();
    vi.useRealTimers();
    expect(svg.querySelectorAll('[data-hover]')).toHaveLength(0);
  });

  it('masque le contour de sélection le temps du survol d’une autre forme', async () => {
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('ellipse', 10, 10), createElement('rect', 50, 50)],
    });
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: layer.elements[0].id });
    const svg = stage();
    render(store.get(), svg);
    const list = document.createElement('div');
    mountShapeList({ store, container: list, svgRoot: svg, status: { show: () => {} } });

    const selection = svg.querySelector('[data-selection]');
    const row = list.querySelector(`[data-focus-key="name-${layer.elements[1].id}"]`).closest('li');
    row.dispatchEvent(new MouseEvent('pointerenter'));
    expect(selection.getAttribute('visibility')).toBe('hidden');
    vi.useFakeTimers();
    row.dispatchEvent(new MouseEvent('pointerleave'));
    /* Délai de sortie : entre deux cards, la sélection ne reprend pas l'accent. */
    expect(selection.getAttribute('visibility')).toBe('hidden');
    vi.runAllTimers();
    vi.useRealTimers();
    expect(selection.hasAttribute('visibility')).toBe(false);
  });
});

describe('rendu des formes', () => {
  it('toutes les formes d’un calque portent l’épaisseur du calque', () => {
    const svg = stage();
    const layer = createLayer({
      strokeWidth: 7,
      center: { x: 0, y: 0 },
      elements: [createElement('ellipse', 10, 10), createElement('rect', 50, 50)],
      modifiers: [{ type: 'step', n: 2, stepX: 10, stepY: 0, angleStep: 0, radiusStep: 0 }],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const widths = [...svg.querySelectorAll('ellipse, rect')].map((node) =>
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
        createElement('ellipse', 10, 10),
        createElement('rect', 50, 50, { filled: true }),
      ],
      modifiers: [{ type: 'none', n: 1, angleStep: 0, radiusStep: 0 }],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const [circle, rect] = svg.querySelectorAll('ellipse, rect');
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

    render({ layers: [shaped('ellipse'), shaped('point'), shaped('rect')], activeElementId: null }, svg);

    expect(svg.querySelectorAll('ellipse')).toHaveLength(1);
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

  it('l’ellipse se rend en <ellipse> à deux rayons, mis à l’échelle', () => {
    const svg = stage();
    const layer = createLayer({
      elements: [createElement('ellipse', 100, 50, { rx: 40, ry: 20 })],
      interpolations: [ramp('scale', [0.5, 0.5])],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const node = svg.querySelector('ellipse');
    expect(['cx', 'cy', 'rx', 'ry'].map((a) => node.getAttribute(a))).toEqual(['100', '50', '20', '10']);
  });

  it('le polygone se rend en un seul <polygon>, premier sommet en haut', () => {
    const svg = stage();
    const layer = createLayer({
      elements: [createElement('polygon', 0, 0, { rx: 10, sides: 4 })],
      interpolations: [ramp('scale', [2, 2])],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    expect(svg.querySelectorAll('polygon')).toHaveLength(1);
    expect(svg.querySelectorAll('line')).toHaveLength(0);
    expect(svg.querySelector('polygon').getAttribute('points')).toBe('0,-20 20,0 0,20 -20,0');
  });

  it('sous 100 % de rayon intérieur, le polygone devient une étoile', () => {
    const svg = stage();
    const layer = createLayer({
      elements: [createElement('polygon', 0, 0, { rx: 10, sides: 5, inner: 50 })],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const points = svg
      .querySelector('polygon')
      .getAttribute('points')
      .split(' ')
      .map((pair) => Math.hypot(...pair.split(',').map(Number)));
    expect(points).toHaveLength(10);
    const hollow = 10 * Math.cos(Math.PI / 5) * 0.5;
    points.forEach((r, i) => expect(r).toBeCloseTo(i % 2 ? hollow : 10, 2));
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

  it('la suppression d’un calque, sans confirmation, rend le focus au bouton d’ajout', async () => {
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const layer = repeatLayer();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const panel = document.createElement('div');
    document.body.append(panel);
    mountLayerPanel({ store, container: panel, status: { show: () => {} } });

    const remove = panel.querySelector(`[data-focus-key="delete-${layer.id}"]`);
    remove.focus();
    remove.click();

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

    const curve = block().querySelector('select[aria-label="Courbe de la rampe"]');
    expect(curve.value).toBe('linear');
    curve.value = 'pingPong';
    curve.dispatchEvent(new Event('change'));
    expect(stack()[0].curve).toBe('pingPong');

    /* Les bornes se saisissent en pourcentage. */
    const [start] = block().querySelectorAll('input[type="number"]');
    start.focus();
    start.value = '20';
    start.dispatchEvent(new Event('input'));
    expect(stack()[0].range[0]).toBeCloseTo(0.2);
    /* Un champ réglé en pleine saisie garde le focus : le bloc ne s'est pas
       reconstruit sous le curseur. */
    expect(document.activeElement).toBe(start);

    const remove = panel.querySelector(`[data-focus-key="delete-interpolation${id}"]`);
    remove.focus();
    remove.click();
    expect(stack()).toEqual([]);
    /* Le focus retombe sur le bouton d'ajout, pas en haut de la page. */
    expect(document.activeElement.dataset.focusKey).toBe('add-interpolation');
    panel.remove();
  });

  it('affiche le total des copies de la pile, et la suspension au-delà du plafond', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { addModifier, createLayer, updateModifier } = await import('../src/scene.js');
    const layer = createLayer();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const panel = document.createElement('div');
    panel.append(mountPropertyPanel({ store }).layerDetail);
    const total = panel.querySelector('.copy-count');

    expect(total.hidden).toBe(true);
    store.apply(addModifier, layer.id);
    store.apply(addModifier, layer.id);
    expect(total.hidden).toBe(false);
    expect(total.textContent).toBe('36 copies');

    store.apply(updateModifier, layer.id, 0, { n: 1000 });
    expect(total.dataset.tone).toBe('error');
    expect(total.textContent).toMatch(/suspendu/);
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
    mountShapeList({ store, container: shapeList, status: { show: () => {} } });

    expect(store.get().layers[0].elements).toHaveLength(0);
    expect(shapeDetail.hidden).toBe(true);

    /* Le glissement sur le plan de travail n'a pas d'équivalent clavier : ce
       bouton est le seul chemin vers la création d'une forme sans souris. */
    shapeList.querySelector('[data-focus-key="add-shape"]').click();
    expect(store.get().layers[0].elements).toHaveLength(1);

    /* La forme ajoutée est sélectionnée : le panneau passe à ses réglages. */
    expect(shapeDetail.hidden).toBe(false);
    const byLabel = (text) =>
      shapeDetail.querySelector(`#${[...shapeDetail.querySelectorAll('label')].find((l) => l.textContent === text).htmlFor}`);
    const [x, y] = [byLabel('X'), byLabel('Y')];
    x.value = '210';
    x.dispatchEvent(new Event('change'));
    y.value = '340';
    y.dispatchEvent(new Event('change'));

    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 210, y: 340 });
  });

  it('le panneau suit le calque choisi dans l’arbre, sans reconstruire ses champs', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const { createLayer, renameLayer } = await import('../src/scene.js');
    const [bottom, top] = [createLayer(), createLayer()];
    const store = createStore({ layers: [bottom, top], activeLayerId: bottom.id, activeElementId: null });
    store.apply(renameLayer, top.id, 'Haut');
    const panel = document.createElement('div');
    const inspector = document.createElement('div');
    document.body.append(panel, inspector);
    const { layerDetail } = mountPropertyPanel({ store, container: inspector });
    mountLayerPanel({ store, container: panel, status: { show: () => {} } });

    /* Un champ réglé en pleine saisie reste en place, focus compris. */
    const thickness = layerDetail.querySelector('.slider-field input[type="number"]');
    thickness.focus();
    thickness.value = '4';
    thickness.dispatchEvent(new Event('change'));
    expect(store.get().layers[0].strokeWidth).toBe(4);
    expect(document.activeElement).toBe(thickness);

    panel.querySelector(`[data-focus-key="name-${top.id}"]`).click();
    expect(store.get().activeLayerId).toBe(top.id);
    expect(layerDetail.querySelector('.inspector-title').textContent).toBe('Haut');
    expect(layerDetail.contains(thickness)).toBe(true);
    panel.remove();
    inspector.remove();
  });

  it('choisir un calque relâche la forme ; son chevron replie ses formes sans le désélectionner', async () => {
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const { addElement, createLayer } = await import('../src/scene.js');
    const layer = createLayer();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    store.apply(addElement, layer.id, 'rect', 10, 10);
    const panel = document.createElement('div');
    const shapeList = document.createElement('div');
    mountShapeList({ store, container: shapeList, status: { show: () => {} } });
    mountLayerPanel({ store, container: panel, status: { show: () => {} }, children: shapeList });

    const card = () => panel.querySelector(`[data-layer-id="${layer.id}"]`);
    const chevron = () => panel.querySelector(`[data-focus-key="chevron-${layer.id}"]`);
    expect(card().contains(shapeList)).toBe(true);
    expect(card().dataset.selected).toBe('parent');

    panel.querySelector(`[data-focus-key="name-${layer.id}"]`).click();
    expect(store.get().activeElementId).toBeNull();
    expect(card().dataset.selected).toBe('layer');

    chevron().click();
    expect(store.get().activeLayerId).toBe(layer.id);
    expect(card().contains(shapeList)).toBe(false);
    expect(chevron().getAttribute('aria-expanded')).toBe('false');

    chevron().click();
    expect(card().contains(shapeList)).toBe(true);
  });
});

describe('tracé', () => {
  const mountTrace = (elements = []) => {
    const layer = createLayer({ center: { x: 0, y: 0 }, elements });
    const store = createStore({
      layers: [layer],
      activeLayerId: layer.id,
      activeElementId: elements[0]?.id ?? null,
    });
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
    const container = document.createElement('div');
    const messages = [];
    render(store.get(), svg);
    store.subscribe((next) => render(next, svg));
    mountToolbar({
      store,
      svgRoot: svg,
      container,
      shapeContainer: shapes,
      status: { show: (message, tone) => messages.push([message, tone]) },
    });
    const pick = (type) => {
      const radio = shapes.querySelector(`#shape-${type}`);
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    };
    return { store, svg, container, messages, pick };
  };

  const on = (node, type, x = 0, y = 0) =>
    node.dispatchEvent(new MouseEvent(type, { button: 0, bubbles: true, clientX: x, clientY: y }));
  const click = (svg, x, y) => {
    on(svg, 'pointerdown', x, y);
    on(svg, 'pointerup', x, y);
  };
  const absolute = (element) => element.points.map((p) => [element.x + p.x, element.y + p.y]);

  it('se rend en <polyline> ouvert ou <polygon> fermé, mis à l’échelle depuis son centre', () => {
    const svg = stage();
    const points = [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const layer = createLayer({
      elements: [
        createElement('polyline', 100, 100, { points, closed: false }),
        createElement('polyline', 200, 100, { points, closed: true }),
      ],
      interpolations: [ramp('scale', [2, 2])],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    expect(svg.querySelector('polyline').getAttribute('points')).toBe('80,100 120,100 100,120');
    expect(svg.querySelector('polygon').getAttribute('points')).toBe('180,100 220,100 200,120');
  });

  it('suit les modificateurs d’un bloc', () => {
    const svg = stage();
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('polyline', 100, 0)],
      modifiers: [{ type: 'step', n: 3, stepX: 50, stepY: 0 }],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const firsts = [...svg.querySelectorAll('polygon')].map((node) => node.getAttribute('points').split(' ')[0]);
    expect(firsts).toEqual(['100,-50', '150,-50', '200,-50']);
  });

  it('chaque clic pose un sommet, cliquer sur le premier ferme le tracé', () => {
    const { store, svg, pick } = mountTrace();
    pick('polyline');
    click(svg, 0, 0);
    click(svg, 100, 0);
    click(svg, 100, 100);
    click(svg, 2, 1);
    const element = store.get().layers[0].elements.at(-1);
    expect(element).toMatchObject({ type: 'polyline', closed: true, x: 50, y: 50 });
    expect(absolute(element)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it('le double-clic termine un tracé ouvert sans sommet doublé', () => {
    const { store, svg, pick } = mountTrace();
    pick('polyline');
    click(svg, 0, 0);
    click(svg, 60, 20);
    click(svg, 60, 20);
    on(svg, 'dblclick', 60, 20);
    const element = store.get().layers[0].elements.at(-1);
    expect(element.closed).toBe(false);
    expect(absolute(element)).toEqual([
      [0, 0],
      [60, 20],
    ]);
  });

  it('un tracé d’un seul sommet disparaît à la fin du geste', () => {
    const { store, svg, pick } = mountTrace();
    pick('polyline');
    click(svg, 10, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.get().layers[0].elements).toHaveLength(0);
  });

  it('au curseur, glisser une poignée déplace ce seul sommet', () => {
    const trace = createElement('polyline', 0, 0, {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      closed: false,
    });
    const { store, svg, pick } = mountTrace([trace]);
    pick('cursor');
    const handle = svg.querySelectorAll('[data-vertex]')[1];
    on(handle, 'pointerdown', 100, 0);
    on(svg, 'pointermove', 100, 40);
    on(svg, 'pointerup', 100, 40);
    expect(absolute(store.get().layers[0].elements[0])).toEqual([
      [0, 0],
      [100, 40],
    ]);
  });

  it('les poignées ne partent pas à l’export', () => {
    const trace = createElement('polyline', 0, 0);
    const { svg } = mountTrace([trace]);
    expect(svg.querySelectorAll('[data-vertex]')).toHaveLength(3);
    expect(toSvgDocument(svg)).not.toContain('data-vertex');
  });

  it('coller un chemin ajoute ses sous-tracés en un seul pas', () => {
    const { store, container, messages } = mountTrace();
    const before = store.get();
    globalThis.prompt = () => '<path d="M0 0 H10 V10 Z M20 20 l5 5" />';
    [...container.querySelectorAll('button')].find((b) => b.textContent === 'Coller un tracé…').click();
    const elements = store.get().layers[0].elements;
    expect(elements.map((e) => [e.closed, absolute(e)])).toEqual([
      [true, [[0, 0], [10, 0], [10, 10]]],
      [false, [[20, 20], [25, 25]]],
    ]);
    expect(messages.at(-1)[0]).toBe('2 tracés ajoutés.');
    store.undo();
    expect(store.get()).toBe(before);
  });

  it('refuse une courbe et le dit', () => {
    const { store, container, messages } = mountTrace();
    globalThis.prompt = () => 'M0 0 C 10 10 20 20 30 30';
    [...container.querySelectorAll('button')].find((b) => b.textContent === 'Coller un tracé…').click();
    expect(store.get().layers[0].elements).toHaveLength(0);
    expect(messages.at(-1)).toEqual([expect.stringContaining('« C »'), 'error']);
  });
});

describe('rotation propre', () => {
  it('tourne la forme autour de son centre, sans toucher sa géométrie', () => {
    const svg = stage();
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('rect', 100, 50, { rx: 40, ry: 20, rotation: 30 }), createElement('rect', 0, 0)],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    const [turned, straight] = svg.querySelectorAll('rect');
    expect(turned.getAttribute('transform')).toBe('rotate(30 100 50)');
    expect(turned.getAttribute('x')).toBe('60');
    expect(straight.hasAttribute('transform')).toBe(false);
    expect(toSvgDocument(svg)).toContain('rotate(30 100 50)');
  });
});

describe('arc', () => {
  const arcPath = (extra) => {
    const svg = stage();
    const layer = createLayer({
      elements: [createElement('arc', 0, 0, { rx: 10, ry: 10, start: 0, end: 90, ...extra })],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    return svg.querySelector('path').getAttribute('d');
  };

  it('part du haut en sens horaire, fermé selon le mode', () => {
    expect(arcPath({ closure: 'open' })).toBe('M0,-10 A10,10 0 0 1 10,0');
    expect(arcPath({ closure: 'chord' })).toBe('M0,-10 A10,10 0 0 1 10,0 Z');
    expect(arcPath({ closure: 'sector' })).toBe('M0,-10 A10,10 0 0 1 10,0 L0,0 Z');
    expect(arcPath({ closure: 'open', start: 270, end: 90 })).toBe('M-10,0 A10,10 0 0 1 10,0');
    expect(arcPath({ closure: 'open', end: 270 })).toBe('M0,-10 A10,10 0 1 1 -10,0');
  });

  it('de 0 à 360° rend un cercle fermé, sans rayon ni raccord', () => {
    for (const closure of ['open', 'chord', 'sector']) {
      expect(arcPath({ closure, end: 360 })).toBe('M0,-10 A10,10 0 0 1 0,10 A10,10 0 0 1 0,-10 Z');
    }
  });

  it('un secteur rempli se peint de la couleur du calque', () => {
    const svg = stage();
    const layer = createLayer({
      stroke: '#ff0000',
      elements: [createElement('arc', 0, 0, { closure: 'sector', filled: true })],
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    expect(svg.querySelector('path').getAttribute('fill')).toBe('#ff0000');
  });
});

describe('orientation des copies', () => {
  it('le reflet d’un miroir est retourné autour du centre de la copie', () => {
    const svg = stage();
    const layer = createLayer({
      center: { x: 0, y: 0 },
      elements: [createElement('line', 100, 20, { rx: 40, ry: 30 })],
      modifiers: [{ type: 'mirrorH', n: 2 }],
    });
    render({ layers: [layer] }, svg);
    const [original, reflected] = svg.querySelectorAll('line');
    expect(original.hasAttribute('transform')).toBe(false);
    expect(reflected.getAttribute('transform')).toBe('translate(-100 20) scale(-1 1) translate(100 -20)');
  });
});

describe('style de trait', () => {
  it('un anneau en pointillés se rend et s’exporte identique, tirets à l’échelle', () => {
    const svg = stage();
    const layer = createLayer({
      strokeWidth: 2,
      elements: [createElement('ellipse', 0, 0, { dash: [0, 2], linecap: 'round' })],
      modifiers: [{ type: 'step', n: 2, stepX: 0, stepY: 0, angleStep: 0, radiusStep: 0 }],
      interpolations: [ramp('scale', [1, 0.5])],
    });
    render({ layers: [layer] }, svg);
    const [big, small] = svg.querySelectorAll('ellipse');
    expect(big.getAttribute('stroke-dasharray')).toBe('0 4');
    expect(big.getAttribute('stroke-linecap')).toBe('round');
    expect(small.getAttribute('stroke-dasharray')).toBe('0 2');
    expect(toSvgDocument(svg)).toContain('stroke-dasharray="0 4"');
  });

  it('un trait plein à bout net n’ajoute rien', () => {
    const svg = stage();
    render({ layers: [createLayer({ elements: [createElement('ellipse', 0, 0)] })] }, svg);
    const circle = svg.querySelector('ellipse');
    expect(circle.hasAttribute('stroke-dasharray')).toBe(false);
    expect(circle.hasAttribute('stroke-linecap')).toBe(false);
  });
});

describe('panneau : motif de trait', () => {
  it('le segment Points pose tirets et bout rond, la saisie libre garde son motif', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const element = createElement('ellipse', 0, 0);
    const layer = createLayer({ elements: [element, createElement('ellipse', 50, 0)] });
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: element.id });
    const { shapeDetail } = mountPropertyPanel({ store });
    const [trait, bout] = shapeDetail.querySelectorAll('fieldset.segmented');
    const radio = (group, value) => group.querySelector(`input[value="${value}"]`);
    expect(radio(trait, 'solid').checked).toBe(true);

    radio(trait, 'dotted').checked = true;
    radio(trait, 'dotted').dispatchEvent(new Event('change'));
    const shapes = () => store.get().layers[0].elements;
    expect(shapes()[0]).toMatchObject({ dash: [0, 2], linecap: 'round' });
    expect(shapes()[1]).toMatchObject({ dash: [], linecap: 'butt' });
    expect(radio(bout, 'round').checked).toBe(true);

    /* Tirets : le curseur de longueur apparaît et ne touche que le premier tiret. */
    const length = shapeDetail.querySelector('.slider-field');
    expect(length.hidden).toBe(true);
    radio(trait, 'dashed').checked = true;
    radio(trait, 'dashed').dispatchEvent(new Event('change'));
    expect(length.hidden).toBe(false);
    const range = length.querySelector('input[type="range"]');
    range.value = '6';
    range.dispatchEvent(new Event('input'));
    expect(shapes()[0].dash).toEqual([6, 2]);

    const text = shapeDetail.querySelector('input[type="text"]');
    text.value = '3 1 1 1';
    text.dispatchEvent(new Event('change'));
    expect(shapes()[0].dash).toEqual([3, 1, 1, 1]);
    expect(radio(trait, 'dashed').checked).toBe(true);
  });
});

describe('booléens entre formes', () => {
  const WIDE = String(STAGE.width * 3);
  const setup = (steps, overrides = {}) => {
    const tools = steps.map(([, geometry = 'ellipse'], i) => createElement(geometry, i * 30, 0, { rx: 40, ry: 40 }));
    const forme = createElement('rect', 0, 0, {
      booleans: steps.map(([op], i) => ({ with: tools[i].id, op })),
      ...overrides,
    });
    return { tools, forme, layer: createLayer({ elements: [...tools, forme] }) };
  };
  const maskById = (svg, ref) => svg.querySelector(`mask#${ref.slice(5, -1)}`);
  /* Masque décrit par ce qu'il garde : `in` ou `out`, puis ce qu'il peint. */
  const describeMask = (mask) => {
    const out = mask.firstElementChild.getAttribute('width') === WIDE && mask.firstElementChild.tagName.toLowerCase() === 'rect';
    const painted = [...mask.children].slice(out ? 1 : 0);
    const paint = (node) =>
      node.tagName.toLowerCase() === 'g'
        ? `[${[...node.children].map(paint).join(' ')}]∩`
        : `${node.tagName.toLowerCase()}${node.getAttribute('fill') === (out ? '#000' : '#fff') ? '+' : '-'}`;
    return `${out ? 'out' : 'in'}:${painted.map(paint).join(' ')}`;
  };
  /* Bord : sa forme, et les masques qui l'enveloppent du plus proche au plus loin. */
  const edges = (svg, forme) => {
    const group = svg.querySelector(`g[data-element-id="${forme.id}"]`);
    return [...group.children]
      .filter((node) => node.tagName.toLowerCase() === 'g')
      .map((node) => {
        const filters = [];
        let current = node;
        while (current.tagName.toLowerCase() === 'g') {
          filters.unshift(describeMask(maskById(svg, current.getAttribute('mask'))));
          current = current.firstElementChild;
        }
        return [current.tagName.toLowerCase(), ...filters];
      });
  };
  const fillOf = (svg, forme) =>
    [...svg.querySelector(`g[data-element-id="${forme.id}"]`).children].find(
      (node) => node.tagName.toLowerCase() === 'rect',
    );

  it('les outils ne se dessinent pas ; intersection : chaque bord gardé dans l’autre forme', () => {
    const svg = stage();
    const { tools, forme, layer } = setup([['intersect']]);
    render({ layers: [layer] }, svg);
    expect(svg.querySelector(`[data-element-id="${tools[0].id}"]`)).toBeNull();
    expect(edges(svg, forme)).toEqual([
      ['rect', 'in:ellipse+'],
      ['ellipse', 'in:rect+'],
    ]);
    expect(fillOf(svg, forme)).toBeUndefined();
    expect(toSvgDocument(svg)).toContain('<mask');
  });

  it('découpe remplie : aplat masqué par la forme percée de l’outil', () => {
    const svg = stage();
    const { forme, layer } = setup([['subtract']], { filled: true });
    render({ layers: [layer] }, svg);
    expect(edges(svg, forme)).toEqual([
      ['rect', 'out:ellipse+'],
      ['ellipse', 'in:rect+'],
    ]);
    const fill = fillOf(svg, forme);
    expect(fill.getAttribute('stroke')).toBe('none');
    expect(describeMask(maskById(svg, fill.getAttribute('mask')))).toBe('in:rect+ ellipse-');
  });

  it('les opérations s’additionnent dans l’ordre : fusion puis découpe puis intersection', () => {
    const svg = stage();
    const { forme, layer } = setup([['union'], ['subtract', 'rect'], ['intersect']], {
      filled: true,
      dash: [4, 2],
    });
    render({ layers: [layer] }, svg);
    const r1 = 'rect+ ellipse+';
    const r2 = `${r1} rect-`;
    expect(edges(svg, forme)).toEqual([
      /* Bord de la forme : hors du disque, hors du carré, dans le 2e disque. */
      ['rect', 'out:ellipse+', 'out:rect+', 'in:ellipse+'],
      /* Bord du disque fusionné : hors de la forme, puis filtré comme elle. */
      ['ellipse', 'out:rect+', 'out:rect+', 'in:ellipse+'],
      /* Bord du carré découpé : dans le résultat de la fusion, puis dans le 2e disque. */
      ['rect', `in:${r1}`, 'in:ellipse+'],
      /* Bord du 2e disque : dans le résultat de la découpe. */
      ['ellipse', `in:${r2}`],
    ]);
    expect(describeMask(maskById(svg, fillOf(svg, forme).getAttribute('mask')))).toBe(`in:[${r2}]∩`);
    /* Le résultat prend le style de la forme, bords des outils compris. */
    const dashes = [...svg.querySelectorAll(`g[data-element-id="${forme.id}"] g > :not(g)`)]
      .filter((n) => !n.closest('mask'))
      .map((n) => n.getAttribute('stroke-dasharray'));
    expect(dashes).toHaveLength(4);
    expect(new Set(dashes).size).toBe(1);
  });

  it('chaque copie passe par sa propre copie de l’outil, opacité sur le groupe', () => {
    const svg = stage();
    const { forme, layer } = setup([['intersect']]);
    const stepped = {
      ...layer,
      modifiers: [{ type: 'step', n: 3, stepX: 100, stepY: 0, angleStep: 0, radiusStep: 0 }],
      interpolations: [ramp('opacity', [1, 0])],
    };
    render({ layers: [stepped] }, svg);
    const groups = [...svg.querySelectorAll(`g[data-element-id="${forme.id}"]`)];
    expect(groups.map((g) => g.getAttribute('opacity'))).toEqual(['1', '0.5', '0']);
    const toolEdges = groups.map((g) => g.querySelector(':scope > g > ellipse'));
    expect(toolEdges.map((node) => node.getAttribute('cx'))).toEqual(['0', '100', '200']);
    expect(toolEdges.map((node) => node.getAttribute('stroke-opacity'))).toEqual(['1', '1', '1']);
    const ids = [...svg.querySelectorAll('mask')].map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('panneau : booléen', () => {
  it('empile des opérations, chacune avec son outil et son mode', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const disque = createElement('ellipse', 0, 0);
    const carre = createElement('rect', 0, 0);
    const forme = createElement('rect', 0, 0);
    const layer = createLayer({ elements: [disque, carre, forme] });
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: forme.id });
    const { shapeDetail } = mountPropertyPanel({ store });
    const add = shapeDetail.querySelector('[data-focus-key="add-boolean"]');
    const steps = () => store.get().layers[0].elements[2].booleans;
    expect(add.closest('section').querySelector('h3').textContent).toBe('Booléen');

    add.click();
    add.click();
    expect(steps()).toEqual([
      { with: disque.id, op: 'intersect' },
      { with: carre.id, op: 'intersect' },
    ]);
    const blocks = shapeDetail.querySelectorAll('.modifier-block');
    expect(blocks).toHaveLength(2);
    expect([...blocks[0].querySelectorAll('.segment span')].map((n) => n.textContent)).toEqual([
      'Fusion',
      'Découpe',
      'Intersection',
    ]);
    expect([...blocks[0].querySelector('select').options].map((o) => o.value)).toEqual([disque.id, carre.id]);

    const union = shapeDetail.querySelectorAll('.modifier-block')[0].querySelector('input[value="union"]');
    union.checked = true;
    union.dispatchEvent(new Event('change'));
    const tool = shapeDetail.querySelectorAll('.modifier-block')[1].querySelector('select');
    tool.value = disque.id;
    tool.dispatchEvent(new Event('change'));
    expect(steps()).toEqual([
      { with: disque.id, op: 'union' },
      { with: disque.id, op: 'intersect' },
    ]);

    shapeDetail.querySelector('[data-focus-key="delete-boolean0"]').click();
    expect(steps()).toEqual([{ with: disque.id, op: 'intersect' }]);
  });
});

describe('liste des formes : arborescence des booléens', () => {
  it('l’outil se range sous la forme qui l’emploie, une seule fois même en cycle', async () => {
    const { mountShapeList } = await import('../src/ui/shape-list.js');
    const gabarit = createElement('ellipse', 0, 0);
    const forme = createElement('rect', 0, 0, { booleans: [{ with: gabarit.id, op: 'intersect' }] });
    const libre = createElement('line', 0, 0);
    const layer = createLayer({ elements: [gabarit, forme, libre] });
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const list = document.createElement('div');
    mountShapeList({ store, container: list, status: { show: () => {} } });

    const card = (element) => list.querySelector(`[data-focus-key="name-${element.id}"]`).closest('li');
    expect(card(gabarit).parentElement.closest('li')).toBe(card(forme));
    expect(card(gabarit).dataset.template).toBe('true');
    expect(card(forme).parentElement.closest('li')).toBeNull();
    expect(card(libre).parentElement.closest('li')).toBeNull();

    /* Découpe croisée : chacune apparaît une fois, aucune ne disparaît. */
    store.apply((scene) => ({
      ...scene,
      layers: [{ ...layer, elements: [{ ...gabarit, booleans: [{ with: forme.id, op: 'union' }] }, forme, libre] }],
    }));
    expect(list.querySelectorAll('li')).toHaveLength(3);
  });
});

describe('pivot au canvas', () => {
  const scene = (layer) => ({ layers: [layer], activeLayerId: layer.id, activeElementId: null });

  it('le repère suit le pivot effectivement utilisé par chaque étage', () => {
    const svg = stage();
    const layer = repeatLayer({
      center: { x: 400, y: 300 },
      modifiers: [
        { type: 'mirrorH', n: 2, center: { x: 100, y: 50 } },
        { type: 'axial', n: 4 },
      ],
    });
    render(scene(layer), svg);
    const [mirror, axial] = svg.querySelectorAll('[data-guides] [data-pivot]');
    expect(mirror.dataset.pivot).toBe('0');
    expect(mirror.querySelector('line').getAttribute('x1')).toBe('100');
    expect(axial.dataset.pivot).toBe('1');
    expect(axial.querySelector('line').getAttribute('y1')).toBe('300');
  });
});

describe('recoupements creux', () => {
  const disks = (overrides = {}) =>
    createLayer({
      elements: [createElement('ellipse', 100, 100, { rx: 50, ry: 50, filled: true }), createElement('ellipse', 150, 100, { rx: 50, ry: 50, filled: true })],
      ...overrides,
    });
  const draw = (layer) => {
    const svg = stage();
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    return svg;
  };

  it('éteinte, rend strictement comme avant', () => {
    const layer = disks();
    const { evenOdd, ...legacy } = layer;
    expect(evenOdd).toBe(false);
    expect(draw(layer).innerHTML).toBe(draw(legacy).innerHTML);
    expect(draw(layer).querySelector('[data-even-odd]')).toBeNull();
  });

  it('réunit les aplats en un tracé pair-impair, chaque forme garde son trait', () => {
    const svg = draw(disks({ evenOdd: true }));
    const path = svg.querySelector('[data-even-odd]');
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    expect(path.getAttribute('d').match(/M/g)).toHaveLength(2);
    const outlines = svg.querySelectorAll('ellipse');
    expect([...outlines].map((node) => node.getAttribute('fill'))).toEqual(['none', 'none']);
    /* L'aplat passe sous les traits. */
    expect(path.parentNode.firstChild).toBe(path);
  });

  it('les copies des modificateurs rejoignent le même tracé', () => {
    const svg = draw(
      disks({ evenOdd: true, modifiers: [{ type: 'step', n: 3, stepX: 30, stepY: 0, angleStep: 0, radiusStep: 0 }] }),
    );
    expect(svg.querySelectorAll('[data-even-odd]')).toHaveLength(1);
    expect(svg.querySelector('[data-even-odd]').getAttribute('d').match(/M/g)).toHaveLength(6);
  });

  it('cuit rotation et reflet dans le contour', () => {
    const rect = { ...createElement('rect', 0, 0, { rx: 20, ry: 10 }), rotation: 90, flip: false };
    expect(areaPath(rect)).toBe('M10,-20 L10,20 L-10,20 L-10,-20 Z');
    expect(areaPath({ ...createElement('line', 0, 0), rotation: 0 })).toBeNull();
    const arc = { ...createElement('arc', 0, 0, { rx: 10, start: 0, end: 90, closure: 'open' }), rotation: 0 };
    expect(areaPath(arc)).toBe('M0,-10 A10,10 0 0 1 10,0');
    expect(areaPath({ ...arc, flip: true })).toBe('M0,-10 A10,10 0 0 0 -10,0');
  });

  it('se règle depuis le panneau du calque', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const layer = disks();
    const store = createStore({ layers: [layer], activeLayerId: layer.id, activeElementId: null });
    const panel = document.createElement('div');
    panel.append(mountPropertyPanel({ store }).layerDetail);
    const toggle = [...panel.querySelectorAll('.switch-field')].find((node) => node.textContent.includes('Recoupements creux')).querySelector('input');
    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(store.get().layers[0].evenOdd).toBe(true);
  });
});
