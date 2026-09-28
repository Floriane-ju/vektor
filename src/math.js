/* Petits calculs partagés par le modèle, les modificateurs et les rendus.
   Module feuille : `modifiers.js` et `interpolate.js`, importés par
   `scene.js`, ne peuvent pas passer par lui. */

export const radians = (degrees) => (degrees * Math.PI) / 180;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Angle ramené dans [0, `period`), négatifs compris. */
export const wrapAngle = (value, period = 360) => ((value % period) + period) % period;

/**
 * Boîte englobante `{ minX, minY, maxX, maxY }` de points : une boucle, pas
 * de `Math.min(...xs)`, qui déborde la pile d'arguments au-delà de ~100 000.
 */
export const boundsOf = (points) => {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};
