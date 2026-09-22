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
 * Valeurs interpolées d'une copie, sous une pile d'interpolations.
 *
 * @param {{property: string, range: [number, number]}[]} interpolations pile qui s'applique à la copie
 * @param {(interpolation: object) => number} factorOf facteur de rampe, interpolation par interpolation
 * @returns {Record<string, number>} une entrée par propriété touchée
 *
 * Deux interpolations de la même propriété se composent par produit. 1 est la
 * valeur neutre de l'opacité comme de l'échelle, donc une pile vide ne rend
 * rien, une interpolation seule rend exactement sa rampe, et deux qui se
 * superposent agissent comme deux filtres posés l'un sur l'autre. Le produit
 * est commutatif : l'ordre de la pile n'a pas à être réglable, contrairement à
 * celle des modificateurs.
 *
 * Le facteur est demandé par interpolation, et non calculé ici : c'est ce qui
 * permet à l'une de suivre un étage de la pile de modificateurs pendant qu'une
 * autre court sur le total des copies. Générique sur le nom de propriété :
 * ajouter `rotation` = ajouter une entrée dans `RANGE_BOUNDS`, rien à toucher
 * ici. Une couleur demandera une variante `lerpColor`, le reste ne bouge pas.
 */
export const stackValues = (interpolations, factorOf) => {
  const values = {};
  for (const interpolation of interpolations) {
    const [from, to] = interpolation.range;
    const value = lerp(from, to, factorOf(interpolation));
    values[interpolation.property] = (values[interpolation.property] ?? 1) * value;
  }
  return values;
};
