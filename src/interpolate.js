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
 * Calcule les valeurs interpolées d'une copie.
 *
 * @param {Record<string, [number, number]>} ranges plages `[début, fin]` par propriété
 * @param {(property: string) => number} factorOf facteur de rampe, propriété par propriété
 * @returns {Record<string, number>}
 *
 * Le facteur est demandé par propriété, et non calculé ici : c'est ce qui
 * permet à l'opacité de suivre un étage de la pile pendant que l'échelle court
 * sur le total des copies. Générique sur le nom de propriété : ajouter
 * `rotation` = ajouter une entrée dans `propertyRanges`, rien à toucher ici.
 * Une couleur demandera une variante `lerpColor`, le reste ne bouge pas.
 */
export const interpolateProps = (ranges, factorOf) =>
  Object.fromEntries(
    Object.entries(ranges).map(([key, [from, to]]) => [key, lerp(from, to, factorOf(key))]),
  );
