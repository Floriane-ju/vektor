// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, toSvgDocument } from '../src/renderer-svg.js';
import { createElement, createLayer, STAGE } from '../src/scene.js';
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

const mirrorLayer = (overrides = {}) =>
  createLayer({
    center: { x: 0, y: 0 },
    elements: [createElement('circle', 100, 0)],
    modifier: { type: 'mirrorH', n: 5, angleStep: 0.4, radiusStep: 12 },
    propertyRanges: { opacity: [1, 0], scale: [1, 1] },
    ...overrides,
  });

describe('renderer SVG', () => {
  let svg;
  beforeEach(() => {
    svg = stage();
  });

  it('rend les opacités interpolées sur les enfants', () => {
    render({ layers: [mirrorLayer()], activeLayerId: null, activeElementId: null }, svg);
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
    const layer = mirrorLayer({
      modifier: { type: 'mirrorH', n: 3, angleStep: 0, radiusStep: 0 },
      propertyRanges: { opacity: [1, 1], scale: [1, 2] },
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);
    expect([...svg.querySelectorAll('circle')].map((c) => c.getAttribute('r'))).toEqual([
      '60',
      '90',
      '120',
    ]);
  });

  it('un groupe par calque, dans l’ordre du tableau (z-order)', () => {
    const back = mirrorLayer({ modifier: { type: 'none', n: 1 } });
    const front = mirrorLayer({ modifier: { type: 'none', n: 1 } });
    render({ layers: [back, front], activeLayerId: null, activeElementId: null }, svg);
    expect([...svg.querySelectorAll('g')].map((g) => g.dataset.layerId)).toEqual([
      back.id,
      front.id,
    ]);
  });

  it('un calque masqué n’émet aucun nœud', () => {
    render({ layers: [mirrorLayer({ visible: false })], activeLayerId: null, activeElementId: null }, svg);
    expect(svg.childNodes).toHaveLength(0);
  });

  it('un re-rendu remplace le contenu au lieu de l’empiler', () => {
    const scene = { layers: [mirrorLayer()], activeLayerId: null, activeElementId: null };
    render(scene, svg);
    render(scene, svg);
    expect(svg.querySelectorAll('circle')).toHaveLength(5);
  });
});

describe('export SVG', () => {
  it('reprend exactement les nœuds affichés', () => {
    const svg = stage();
    render({ layers: [mirrorLayer()], activeLayerId: null, activeElementId: null }, svg);
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
    render({ layers: [mirrorLayer()], activeLayerId: null, activeElementId: null }, svg);
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

  it('le point reste circulaire et plein', () => {
    const { store, svg, shapes } = withLayer();
    pick(shapes, 'point');
    pointer(svg, 'pointerdown', 200, 200);
    pointer(svg, 'pointerup', 230, 240);

    const element = store.get().layers[0].elements.at(-1);
    expect(element).toMatchObject({ type: 'point', rx: 50, ry: 50 });
    expect(element.fill).not.toBe('none');
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

  it('changer de type reprend les défauts du nouveau, pas le style de l’ancien', () => {
    const { store, svg, shapes } = withLayer();
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointerup', 100, 160);
    expect(store.get().layers[0].elements.at(-1).fill).toBe('none');

    pick(shapes, 'point');
    pointer(svg, 'pointerdown', 100, 100);
    pointer(svg, 'pointerup', 100, 160);
    /* Sans cette reprise, le point héritait du `fill: none` du cercle et
       n'apparaissait pas du tout. */
    expect(store.get().layers[0].elements.at(-1).fill).not.toBe('none');
  });

  it('refuse sans calque actif et le signale', () => {
    const { store, svg, messages } = mount({ layers: [], activeLayerId: null, activeElementId: null });
    pointer(svg, 'pointerdown', 10, 10);
    pointer(svg, 'pointerup', 60, 60);

    expect(store.get().layers).toEqual([]);
    expect(messages[0][1]).toBe('error');
  });
});

describe('rendu des formes', () => {
  it('émet le nœud SVG correspondant à la géométrie', () => {
    const svg = stage();
    const shaped = (type, extra = {}) =>
      createLayer({
        center: { x: 0, y: 0 },
        elements: [createElement(type, 100, 50, { rx: 40, ry: 20, ...extra })],
        modifier: { type: 'none', n: 1, angleStep: 0, radiusStep: 0 },
      });

    render({ layers: [shaped('circle'), shaped('point'), shaped('rect')], activeElementId: null }, svg);

    expect(svg.querySelectorAll('circle')).toHaveLength(2);
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
      modifier: { type: 'mirrorH', n: 2, angleStep: 0, radiusStep: 0 },
      center: { x: 100, y: 0 },
      propertyRanges: { opacity: [1, 1], scale: [1, 2] },
    });
    render({ layers: [layer], activeLayerId: null, activeElementId: null }, svg);

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
      modifier: { type: 'mirrorH', n: 3, angleStep: 0, radiusStep: 0 },
      propertyRanges: { opacity: [1, 1], scale: [1, 3] },
    });
    render({ layers: [layer], activeElementId: null }, svg);

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

    saveLocal({ layers: [mirrorLayer()], activeLayerId: null, activeElementId: null });
    expect(loadLocal().error).toBeNull();
    expect(loadLocal().scene.layers).toHaveLength(1);
    localStorage.removeItem(KEY);
  });
});

describe('accessibilité au clavier', () => {
  it('le bouton icône garde le focus après reconstruction du panneau', async () => {
    const { mountLayerPanel } = await import('../src/ui/layer-panel.js');
    const [bottom, middle, top] = [mirrorLayer(), mirrorLayer(), mirrorLayer()];
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
    const layer = mirrorLayer();
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

  it('la forme s’ajoute et se positionne sans souris', async () => {
    const { mountPropertyPanel } = await import('../src/ui/property-panel.js');
    const { createLayer } = await import('../src/scene.js');
    const layer = createLayer();
    const store = createStore({
      layers: [layer],
      activeLayerId: layer.id,
      activeElementId: null,
    });
    const panel = document.createElement('div');
    mountPropertyPanel({ store, container: panel, status: { show: () => {} } });

    expect(store.get().layers[0].elements).toHaveLength(0);

    /* Le glissement sur le plan de travail n'a pas d'équivalent clavier : ce
       bouton est le seul chemin vers la création d'une forme sans souris. */
    panel.querySelector('[data-focus-key="add-shape"]').click();
    expect(store.get().layers[0].elements).toHaveLength(1);

    const [x, y] = panel.querySelectorAll('input[type="number"]');
    x.value = '210';
    x.dispatchEvent(new Event('change'));
    y.value = '340';
    y.dispatchEvent(new Event('change'));

    expect(store.get().layers[0].elements[0]).toMatchObject({ x: 210, y: 340 });
  });
});
