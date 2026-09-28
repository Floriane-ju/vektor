/**
 * Lecture d'un tracé collé : un attribut `d` de `<path>`, un attribut `points`
 * de `<polygon>`/`<polyline>`, ou la balise entière qui les porte.
 *
 * Rend une liste de sous-tracés `{ points: [{x, y}], closed }` en coordonnées
 * absolues. Un `d` à plusieurs `M` donne plusieurs sous-tracés — un labyrinthe
 * collé d'un bloc en compte des dizaines.
 *
 * Le modèle ne porte que des sommets : les courbes (C, S, Q, T, A) sont
 * échantillonnées en segments droits.
 *
 * ponytail: pas fixe (CURVE_STEPS par Bézier, ARC_STEP par arc), pas adaptatif
 * à la courbure ni au zoom — une grande courbe très tendue montre ses facettes.
 * Échantillonner à la longueur le jour où ça se voit.
 */

import { MAX_POINTS } from './scene.js';
import { radians } from './math.js';

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const TOKEN = /[a-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/* Sous-tracés d'un seul collage : chacun devient une forme (`addTraces`).
   ponytail: plafond fixe, un labyrinthe en compte des dizaines ; à relever si
   un vrai dessin collé le dépasse. */
export const MAX_TRACES = 500;

const CURVE_STEPS = 16;
const ARC_STEP = Math.PI / 16;

const fail = (message) => {
  throw new Error(message);
};

const lerpPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/* Sommets d'une Bézier (quadratique ou cubique) après son départ : de Casteljau,
   le dernier est exactement le point d'arrivée. */
const bezier = (controls) =>
  Array.from({ length: CURVE_STEPS }, (_, k) => {
    let level = controls;
    const t = (k + 1) / CURVE_STEPS;
    while (level.length > 1) level = level.slice(1).map((point, j) => lerpPoint(level[j], point, t));
    return level[0];
  });

const reflect = (control, about) => ({ x: 2 * about.x - control.x, y: 2 * about.y - control.y });

/* Sommets d'un arc elliptique après son départ, par la conversion en centre
   de la spécification SVG (annexe F.6.5), rayons agrandis s'ils ne suffisent pas. */
const arc = (from, [rxIn, ryIn, degrees, large, sweep], to) => {
  if (from.x === to.x && from.y === to.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [to];
  const phi = radians(degrees);
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(from.x - to.x) / 2, (from.y - to.y) / 2];
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = x1 ** 2 / rx ** 2 + y1 ** 2 / ry ** 2;
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
  const den = rx ** 2 * y1 ** 2 + ry ** 2 * x1 ** 2;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx ** 2 * ry ** 2 - den) / den));
  const [ux, uy] = [(coef * rx * y1) / ry, (-coef * ry * x1) / rx];
  const center = { x: cos * ux - sin * uy + (from.x + to.x) / 2, y: sin * ux + cos * uy + (from.y + to.y) / 2 };
  const start = Math.atan2((y1 - uy) / ry, (x1 - ux) / rx);
  let delta = Math.atan2((-y1 - uy) / ry, (-x1 - ux) / rx) - start;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / ARC_STEP));
  return Array.from({ length: steps }, (_, k) => {
    if (k === steps - 1) return to;
    const angle = start + (delta * (k + 1)) / steps;
    const [ex, ey] = [rx * Math.cos(angle), ry * Math.sin(angle)];
    return { x: center.x + ex * cos - ey * sin, y: center.y + ex * sin + ey * cos };
  });
};

const attribute = (text, name) =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(text)?.slice(2).find((v) => v !== undefined);

const parsePoints = (text, closed) => {
  const numbers = (text.match(NUMBER) ?? []).map(Number);
  if (numbers.length < 4 || numbers.length % 2 !== 0) fail('Liste de points incomplète.');
  const points = [];
  for (let i = 0; i < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return [{ points, closed }];
};

const parseD = (d) => {
  const tokens = d.match(TOKEN) ?? [];
  const paths = [];
  let current = null;
  let command = null;
  let pen = { x: 0, y: 0 };
  let start = pen;
  /* Dernier point de contrôle, pour le reflet de S (après C/S) et T (après Q/T). */
  let lastCubic = null;
  let lastQuad = null;
  let i = 0;

  const read = () => {
    const value = Number(tokens[i]);
    if (i >= tokens.length || !Number.isFinite(value)) fail('Coordonnée manquante dans le chemin.');
    i += 1;
    return value;
  };
  /* Les drapeaux d'arc s'écrivent souvent collés (« 0 1020 0 » = 0, 1, 0, 20, 0). */
  const readFlag = () => {
    const token = tokens[i];
    if (token === undefined || !/^[01]/.test(token)) fail('Drapeau d’arc manquant dans le chemin.');
    if (token.length === 1) i += 1;
    else tokens[i] = token.slice(1);
    return token[0] === '1';
  };
  const point = (base) => ({ x: base.x + read(), y: base.y + read() });
  const lineTo = (point) => {
    if (!current) {
      current = { points: [start], closed: false };
      paths.push(current);
    }
    pen = point;
    current.points.push(point);
  };
  const curveTo = (points) => points.forEach(lineTo);

  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) {
      command = tokens[i];
      i += 1;
      if (!/[mlhvzcsqta]/i.test(command)) fail(`Commande « ${command} » inconnue dans le chemin.`);
    } else if (!command) {
      fail('Coordonnée sans commande dans le chemin.');
    }
    if (paths.length === 0 && command.toLowerCase() !== 'm') fail('Le chemin doit commencer par M.');
    const relative = command === command.toLowerCase();
    const base = relative ? pen : { x: 0, y: 0 };
    const from = pen;
    const [cubic, quad] = [lastCubic, lastQuad];
    lastCubic = null;
    lastQuad = null;

    switch (command.toLowerCase()) {
      case 'm': {
        const point = { x: base.x + read(), y: base.y + read() };
        current = { points: [point], closed: false };
        paths.push(current);
        pen = point;
        start = point;
        /* Des paires qui suivent un M sont des L implicites. */
        command = relative ? 'l' : 'L';
        break;
      }
      case 'l':
        lineTo({ x: base.x + read(), y: base.y + read() });
        break;
      case 'h':
        lineTo({ x: (relative ? pen.x : 0) + read(), y: pen.y });
        break;
      case 'v':
        lineTo({ x: pen.x, y: (relative ? pen.y : 0) + read() });
        break;
      case 'c':
      case 's': {
        const first = command.toLowerCase() === 'c' ? point(base) : cubic ? reflect(cubic, from) : from;
        const second = point(base);
        curveTo(bezier([from, first, second, point(base)]));
        lastCubic = second;
        break;
      }
      case 'q':
      case 't': {
        const control = command.toLowerCase() === 'q' ? point(base) : quad ? reflect(quad, from) : from;
        curveTo(bezier([from, control, point(base)]));
        lastQuad = control;
        break;
      }
      case 'a': {
        const shape = [read(), read(), read(), readFlag(), readFlag()];
        curveTo(arc(from, shape, point(base)));
        break;
      }
      case 'z':
        if (current) current.closed = true;
        /* Après Z, le stylo revient au départ ; un tracé qui continue sans M
           ouvre un nouveau sous-tracé depuis ce point. */
        pen = start;
        current = null;
        command = null;
        break;
    }
  }

  const drawn = paths.filter((path) => path.points.length >= 2);
  if (drawn.length === 0) fail('Le chemin ne trace aucun segment.');
  return drawn;
};

/* Bornes communes à tout ce qui se colle, `d` comme `points`. */
const bounded = (traces) => {
  if (traces.length > MAX_TRACES) fail(`Plus de ${MAX_TRACES} sous-tracés d'un coup.`);
  if (traces.some((trace) => trace.points.length > MAX_POINTS)) {
    fail(`Tracé de plus de ${MAX_POINTS} sommets, courbes échantillonnées comprises.`);
  }
  if (!traces.every((trace) => trace.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))) {
    fail('Coordonnée hors des nombres représentables.');
  }
  return traces;
};

const readTrace = (text) => {
  const source = String(text ?? '').trim();
  if (source === '') fail('Rien à importer.');
  const d = attribute(source, 'd');
  if (d !== undefined) return parseD(d);
  const points = attribute(source, 'points');
  if (points !== undefined) return parsePoints(points, /<\s*polygon\b/i.test(source));
  return /^[a-z]/i.test(source) ? parseD(source) : parsePoints(source, false);
};

export const parseTrace = (text) => bounded(readTrace(text));
