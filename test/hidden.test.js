import { describe, expect, it } from 'vitest';
import { hiddenLines, meshOf } from '../src/hidden.js';
import { planeMatrix } from '../src/plane.js';
import { createElement, createLayer, getRenderedChildren } from '../src/scene.js';

const PLANE = { tilt: 45, heading: 45, sides: 'transparent' };

const childrenOf = (elements, plane = PLANE) =>
  getRenderedChildren(createLayer({ plane, elements })).map((child) => ({ ...child, plane, matrix: planeMatrix(plane) }));

const length = (runs) =>
  runs.reduce((sum, run) => sum + run.slice(1).reduce((total, p, i) => total + Math.hypot(p.x - run[i].x, p.y - run[i].y), 0), 0);
const visible = (lines, element) => {
  const shapes = lines.shapes.filter((shape) => shape.child.id === element.id);
  return shapes.reduce((sum, shape) => sum + length(shape.outlines) + length(shape.flanks) + length(shape.axis), 0);
};

describe('profondeur', () => {
  it('la face du haut et le bas de l’écran sont plus proches', () => {
    const [child] = childrenOf([createElement('rect', 450, 450, { rx: 50, ry: 50, height: 40 })], { tilt: 60, heading: 0 });
    const { chains } = meshOf(child);
    const [bottom, top] = chains.filter((chain) => chain.kind === 'outline');
    expect(top.points[0].z).toBeGreaterThan(bottom.points[0].z);
    /* Coin bas de l'écran (y + 50) plus proche que le coin haut. */
    const low = bottom.points.reduce((a, b) => (b.y > a.y ? b : a));
    const high = bottom.points.reduce((a, b) => (b.y < a.y ? b : a));
    expect(low.z).toBeGreaterThan(high.z);
  });
});

describe('lignes cachées', () => {
  const back = createElement('ellipse', 520, 300, { rx: 60, ry: 60, height: 200 });
  const front = createElement('ellipse', 470, 470, { rx: 90, ry: 90, height: 40, outlined: true, gap: 20 });

  it('ce qui est derrière est caché par ce qui est devant, quel que soit l’ordre', () => {
    const alone = visible(hiddenLines(childrenOf([back])), back);
    const lines = hiddenLines(childrenOf([back, front]));
    const swapped = hiddenLines(childrenOf([front, back]));
    expect(visible(lines, back)).toBeLessThan(alone - 20);
    expect(visible(swapped, back)).toBeCloseTo(visible(lines, back), 6);
    expect(visible(swapped, front)).toBeCloseTo(visible(lines, front), 6);
    /* Le volume de devant n'est pas touché par celui de derrière. */
    expect(visible(lines, front)).toBeCloseTo(visible(hiddenLines(childrenOf([front])), front), 6);
  });

  it('un axe traverse un anneau : caché dans la matière, visible dans le trou', () => {
    const axis = createElement('point', 450, 450, { height: 300 });
    const ring = createElement('ellipse', 450, 450, { rx: 90, ry: 90, height: 40, outlined: true, gap: 30, strokeWidth: 4 });
    const disk = createElement('ellipse', 450, 450, { rx: 90, ry: 90, height: 40 });
    const full = visible(hiddenLines(childrenOf([axis])), axis);
    const throughRing = hiddenLines(childrenOf([axis, ring]));
    const throughDisk = visible(hiddenLines(childrenOf([axis, disk])), axis);
    const runs = throughRing.shapes.find((shape) => shape.child.id === axis.id).axis;
    expect(runs.length).toBeGreaterThan(1);
    expect(visible(throughRing, axis)).toBeLessThan(full - 1);
    expect(throughDisk).toBeLessThan(visible(throughRing, axis) - 1);
  });

  it('un volume se cache lui-même, sauf en fil de fer', () => {
    const solid = createElement('ellipse', 450, 450, { rx: 80, ry: 80, height: 80 });
    const wire = { ...solid, opaque: false };
    expect(visible(hiddenLines(childrenOf([wire])), wire)).toBeGreaterThan(visible(hiddenLines(childrenOf([solid])), solid) + 50);
  });

  it('un fil de fer ne cache pas les autres', () => {
    const wire = { ...front, opaque: false };
    const alone = visible(hiddenLines(childrenOf([back])), back);
    expect(visible(hiddenLines(childrenOf([back, wire])), back)).toBeCloseTo(alone, 6);
  });

  it('les parois d’un tracé ouvert cachent ce qui passe derrière', () => {
    const wall = createElement('line', 450, 520, { rx: 150, ry: 0, height: 120 });
    const behind = createElement('point', 450, 400, { height: 60 });
    const plane = { tilt: 60, heading: 0, sides: 'transparent' };
    const alone = visible(hiddenLines(childrenOf([behind], plane)), behind);
    expect(visible(hiddenLines(childrenOf([wall, behind], plane)), behind)).toBeLessThan(alone - 1);
  });

  it('aplats triés du plus loin au plus proche', () => {
    const far = createElement('rect', 450, 300, { rx: 40, ry: 40, height: 20, filled: true });
    const near = createElement('rect', 450, 600, { rx: 40, ry: 40, height: 20, filled: true });
    const { fills } = hiddenLines(childrenOf([near, far]));
    const ids = fills.map((fill) => fill.child.id);
    expect(ids.lastIndexOf(far.id)).toBeLessThan(ids.indexOf(near.id));
  });
});
