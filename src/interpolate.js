/**
 * Rampe partagée : facteur de l'enfant `i` parmi `n`.
 *
 * Définie ici et importée par modifiers.js pour que la position et les
 * propriétés interpolées utilisent exactement la même échelle — et pour que le
 * cas dégénéré (n = 0 ou 1) soit gardé à un seul endroit plutôt que dans chaque
 * modificateur.
 */
export const t = (i, n) => (n <= 1 ? 0 : i / (n - 1));

export const lerp = (from, to, factor) => from + (to - from) * factor;

/** `n` est toujours un entier ≥ 1 : aucune division par zéro en aval. */
export const clampCount = (n) => Math.max(1, Math.floor(Number(n) || 1));

/**
 * Calcule les valeurs interpolées de l'enfant `i` parmi `n`.
 *
 * @param {Record<string, [number, number]>} ranges plages `[début, fin]` par propriété
 * @returns {Record<string, number>}
 *
 * Générique sur le nom de propriété : ajouter `rotation` = ajouter une entrée
 * dans `propertyRanges`, rien à toucher ici. Une couleur demandera une variante
 * `lerpColor`, le reste du mécanisme ne bouge pas.
 */
export const interpolateProps = (ranges, i, n) =>
  Object.fromEntries(
    Object.entries(ranges).map(([key, [from, to]]) => [key, lerp(from, to, t(i, n))]),
  );
