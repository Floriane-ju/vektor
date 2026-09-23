import { clampCount } from './interpolate.js';

/**
 * Un modificateur est une transformation de point paramétrée par l'indice de
 * copie : `(point, i, n, center, options) -> {x, y}`.
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
 * s'applique donc aussi bien à une forme qu'à un groupe.
 *
 * ponytail: le modificateur ne déplace que le centre — l'angle propre d'une
 * forme (`rotation`) n'est pas tourné avec lui, donc les copies d'un axial
 * gardent toutes la même inclinaison. Ajouter l'angle de la copie à
 * `rotation` le jour où l'on veut des rayons qui suivent le cercle.
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
  i === 0 ? { x: point.x, y: point.y } : { x: 2 * center.x - point.x, y: point.y };

/** Idem sur l'axe horizontal passant par `center.y`. */
const mirrorV = (point, i, n, center) =>
  i === 0 ? { x: point.x, y: point.y } : { x: point.x, y: 2 * center.y - point.y };

/** Copies réparties sur un tour complet autour de `center`. */
const axial = (point, i, n, center) => rotateAround(point, center, (i * Math.PI * 2) / n);

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
  const rotated = rotateAround(point, center, i * angleStep);
  const growth = (1 + radiusStep / 100) ** i;
  return {
    x: center.x + (rotated.x - center.x) * growth,
    y: center.y + (rotated.y - center.y) * growth,
  };
};

const none = (point) => ({ x: point.x, y: point.y });

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
 */
export const applyStack = (point, modifiers, indices, center) =>
  modifiers.reduce(
    (current, modifier, k) =>
      (MODIFIERS[modifier.type] ?? MODIFIERS.none)(
        current,
        indices[k],
        effectiveCount(modifier),
        center,
        modifier,
      ),
    point,
  );
