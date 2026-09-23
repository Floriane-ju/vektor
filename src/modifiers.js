import { clampCount } from './interpolate.js';

/**
 * Un modificateur est une transformation de point paramétrée par l'indice de
 * copie : `(point, i, n, center, options) -> {x, y, angle, flip}`. `angle`
 * (radians) et `flip` (reflet par l'axe vertical, appliqué avant l'angle) sont
 * la partie linéaire de la transformation — ce qu'elle fait à l'orientation
 * d'une forme posée en ce point.
 *
 * Un calque en porte une pile : les copies sont toutes les combinaisons
 * d'indices, un par modificateur. Empiler multiplie donc les copies au lieu de
 * les juxtaposer — une rangée de cinq passée au miroir en fait dix, pas sept.
 *
 * Il s'applique au calque entier, pas forme par forme. La copie `i` déplace
 * toutes les formes du calque du même geste, donc leurs positions relatives
 * sont conservées : un motif composé de trois cercles tourne comme un motif,
 * pas comme trois cercles indépendants.
 *
 * Chaque transformation est donc une similitude — translation, rotation,
 * réflexion, dilatation autour du centre — et ne dépend de la forme que par le
 * point transformé. Une transformation qui déplacerait chaque point selon sa
 * propre distance au centre disloquerait le motif copie après copie.
 *
 * Travailler sur un point plutôt que sur un élément est ce qui rend cela
 * possible — la transformation ne sait rien de la forme qu'elle déplace, et
 * s'applique donc aussi bien à une forme qu'à un groupe. Une similitude a le
 * même angle en tout point : le rendre à côté de la position suffit à orienter
 * la forme, sans rien savoir d'elle.
 */

const rotateAround = (point, center, angle) => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};

/** Tableau : la copie `i` est le calque translaté de `i` pas. */
const step = (point, i, n, center, { stepX = 60, stepY = 0 } = {}) => ({
  x: point.x + i * stepX,
  y: point.y + i * stepY,
  angle: 0,
  flip: false,
});

/**
 * Miroir : l'original et son reflet par rapport à l'axe vertical passant par
 * `center.x`, et rien d'autre.
 *
 * Deux copies exactement. Répartir `n` copies entre le point et son reflet
 * rapprocherait les formes d'un même calque les unes des autres — chacune
 * parcourant sa propre distance à l'axe — et le motif se serait affaissé d'une
 * copie à l'autre. Répéter est le travail de `step`.
 */
const mirrorH = (point, i, n, center) =>
  i === 0
    ? { x: point.x, y: point.y, angle: 0, flip: false }
    : { x: 2 * center.x - point.x, y: point.y, angle: 0, flip: true };

/** Idem sur l'axe horizontal passant par `center.y` : reflet vertical puis demi-tour. */
const mirrorV = (point, i, n, center) =>
  i === 0
    ? { x: point.x, y: point.y, angle: 0, flip: false }
    : { x: point.x, y: 2 * center.y - point.y, angle: Math.PI, flip: true };

/** Copies réparties sur un tour complet autour de `center`. */
const axial = (point, i, n, center) => {
  const angle = (i * Math.PI * 2) / n;
  return { ...rotateAround(point, center, angle), angle, flip: false };
};

/**
 * Spirale : la copie `i` est le calque tourné de `i * angleStep` autour de
 * `center`, puis dilaté de `(1 + radiusStep/100)^i` depuis ce même centre.
 *
 * ponytail: seule transformation non isométrique du lot, mais c'est une
 * similitude — même angle, même facteur pour tous les points. Le motif grandit
 * sans se déformer. Ajouter un pas radial constant au rayon de chaque point
 * (la version précédente) poussait chaque forme dans sa propre direction et
 * disloquait le groupe copie après copie.
 */
const spiral = (point, i, n, center, { angleStep = 0.4, radiusStep = 12 } = {}) => {
  const angle = i * angleStep;
  const rotated = rotateAround(point, center, angle);
  const growth = (1 + radiusStep / 100) ** i;
  return {
    x: center.x + (rotated.x - center.x) * growth,
    y: center.y + (rotated.y - center.y) * growth,
    angle,
    flip: false,
  };
};

const none = (point) => ({ x: point.x, y: point.y, angle: 0, flip: false });

export const MODIFIERS = { none, step, mirrorH, mirrorV, axial, spiral };

export const MODIFIER_LABELS = {
  none: 'Aucun',
  step: 'Pas',
  mirrorH: 'Miroir horizontal',
  mirrorV: 'Miroir vertical',
  axial: 'Miroir axial',
  spiral: 'Spirale',
};

/**
 * Modificateurs dont le nombre de copies est imposé par la transformation :
 * `none` ne duplique rien, un miroir n'a que l'original et son reflet. Ailleurs
 * `n` est libre.
 *
 * Source unique : le rendu compte les copies avec, le panneau y lit s'il faut
 * proposer le champ « Nombre ».
 */
export const FIXED_COPIES = { none: 1, mirrorH: 2, mirrorV: 2 };

/**
 * Modificateurs qui orientent leurs copies tant que la case « Orienter les
 * copies » n'a pas été touchée. `step` et `none` ne tournent rien : la case n'y
 * a pas de sens et n'est pas proposée.
 */
export const ORIENTING = new Set(['mirrorH', 'mirrorV', 'axial', 'spiral']);

/** `orient` absent = réglage par défaut du type. */
export const orients = (modifier) => ORIENTING.has(modifier.type) && (modifier.orient ?? true);

export const effectiveCount = (modifier) =>
  FIXED_COPIES[modifier.type] ?? clampCount(modifier.n);

/**
 * Modificateur neuf. `step` plutôt que `none` : on empile pour ajouter un
 * geste, pas pour en ajouter un qui ne fait rien.
 */
export const createModifier = (overrides = {}) => ({
  type: 'step',
  n: 6,
  stepX: 60,
  stepY: 0,
  angleStep: 0.4,
  radiusStep: 12,
  ...overrides,
});

/**
 * Indices de copie d'une pile : un tableau par copie, un indice par
 * modificateur. Le dernier modificateur varie le plus vite, donc une pile d'un
 * seul élément redonne exactement `[[0], [1], …]`.
 *
 * Une pile vide rend une copie sans transformation — le calque tel quel.
 */
export const stackCopies = (modifiers) =>
  modifiers.reduce(
    (rows, modifier) => {
      const count = effectiveCount(modifier);
      return rows.flatMap((row) => Array.from({ length: count }, (_, i) => [...row, i]));
    },
    [[]],
  );

/**
 * Applique la pile à un point, dans l'ordre : le modificateur suivant travaille
 * sur le résultat du précédent. L'ordre compte — un pas puis un miroir donne
 * deux rangées face à face, un miroir puis un pas une seule rangée doublée.
 *
 * L'orientation cumulée `R(angle)·S^flip` se compose à gauche par celle de
 * chaque étage qui oriente : `R(b)·S^g · R(a)·S^f = R(b ± a)·S^(g⊕f)`, le signe
 * s'inversant quand l'étage reflète. Un étage dont la case est décochée ne
 * déplace que le point.
 */
export const applyStack = (point, modifiers, indices, center) =>
  modifiers.reduce(
    (current, modifier, k) => {
      const next = (MODIFIERS[modifier.type] ?? MODIFIERS.none)(
        current,
        indices[k],
        effectiveCount(modifier),
        center,
        modifier,
      );
      if (!orients(modifier)) return { ...next, angle: current.angle, flip: current.flip };
      return {
        ...next,
        angle: next.angle + (next.flip ? -current.angle : current.angle),
        flip: next.flip !== current.flip,
      };
    },
    { x: point.x, y: point.y, angle: 0, flip: false },
  );
