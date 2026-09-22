import { clampCount, lerp, t } from './interpolate.js';

/**
 * Un modificateur est une transformation de point paramétrée par l'indice de
 * copie : `(point, i, n, center, options) -> {x, y}`.
 *
 * Il s'applique au calque entier, pas forme par forme. La copie `i` déplace
 * toutes les formes du calque du même geste, donc leurs positions relatives
 * sont conservées : un motif composé de trois cercles tourne comme un motif,
 * pas comme trois cercles indépendants.
 *
 * Travailler sur un point plutôt que sur un élément est ce qui rend cela
 * possible — la transformation ne sait rien de la forme qu'elle déplace, et
 * s'applique donc aussi bien à une forme qu'à un groupe.
 *
 * ponytail: pas de rotation propre des formes — un cercle et un point n'en ont
 * pas, et un rectangle tourné demanderait un attribut `transform` sur chaque
 * nœud. À ajouter le jour où une forme orientée arrive.
 */

const rotateAround = (point, center, angle) => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
};

/**
 * Répartit les copies entre le point et son reflet par rapport à l'axe vertical
 * passant par `center.x`.
 *
 * `n = 2` rend le miroir classique (original + reflet) ; `n = 5` rend cinq
 * copies régulièrement espacées sur le segment.
 */
const mirrorH = (point, i, n, center) => ({
  x: lerp(point.x, 2 * center.x - point.x, t(i, n)),
  y: point.y,
});

/** Idem sur l'axe horizontal passant par `center.y`. */
const mirrorV = (point, i, n, center) => ({
  x: point.x,
  y: lerp(point.y, 2 * center.y - point.y, t(i, n)),
});

/** Copies réparties sur un tour complet autour de `center`. */
const axial = (point, i, n, center) => rotateAround(point, center, (i * Math.PI * 2) / n);

/**
 * Spirale : la copie `i` est à `(r0 + i * radiusStep, θ0 + i * angleStep)` en
 * coordonnées polaires autour de `center`.
 */
const spiral = (point, i, n, center, { angleStep = 0.4, radiusStep = 12 } = {}) => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const radius = Math.hypot(dx, dy) + i * radiusStep;
  const angle = Math.atan2(dy, dx) + i * angleStep;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
};

const none = (point) => ({ x: point.x, y: point.y });

export const MODIFIERS = { none, mirrorH, mirrorV, axial, spiral };

export const MODIFIER_LABELS = {
  none: 'Aucun',
  mirrorH: 'Miroir horizontal',
  mirrorV: 'Miroir vertical',
  axial: 'Miroir axial',
  spiral: 'Spirale',
};

/** `none` ne duplique rien : son nombre effectif de copies vaut toujours 1. */
export const effectiveCount = (modifier) =>
  modifier.type === 'none' ? 1 : clampCount(modifier.n);
