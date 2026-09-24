/**
 * Rampe partagée : facteur de l'enfant `i` parmi `n`.
 *
 * Définie ici et importée par modifiers.js pour que la position et les
 * propriétés interpolées utilisent exactement la même échelle — et pour que le
 * cas dégénéré (n = 0 ou 1) soit gardé à un seul endroit plutôt que dans chaque
 * modificateur.
 */
export const t = (i, n) => (n <= 1 ? 0 : i / (n - 1));

/**
 * Courbes de rampe : `(i, n) -> facteur` entre 0 et 1, toutes bâties sur `t`
 * sauf l'alternance, qui ne lit que la parité du rang. Une interpolation porte
 * la sienne ; absente ou inconnue, la rampe reste linéaire.
 */
export const CURVES = {
  linear: t,
  easeIn: (i, n) => t(i, n) ** 2,
  easeOut: (i, n) => 1 - (1 - t(i, n)) ** 2,
  /* Aller-retour : 0 aux deux bouts, 1 à mi-course. */
  pingPong: (i, n) => 1 - Math.abs(2 * t(i, n) - 1),
  alternate: (i) => i % 2,
};

export const CURVE_LABELS = {
  linear: 'Linéaire',
  easeIn: 'Entrée douce',
  easeOut: 'Sortie douce',
  pingPong: 'Aller-retour',
  alternate: 'Alternance',
};

export const ramp = (curve, i, n) => (CURVES[curve] ?? t)(i, n);

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
 * ajouter une propriété = ajouter une entrée dans `RANGE_BOUNDS`, rien à toucher
 * ici. Une couleur demandera une variante `lerpColor`, le reste ne bouge pas.
 *
 * Exception : une propriété marquée `additive` dans `bounds` (la rotation) se
 * compose par somme, neutre 0 — deux vrilles s'ajoutent, elles ne se
 * multiplient pas.
 */
export const stackValues = (interpolations, factorOf, bounds = {}) => {
  const values = {};
  for (const interpolation of interpolations) {
    const [from, to] = interpolation.range;
    const value = lerp(from, to, factorOf(interpolation));
    const { property } = interpolation;
    values[property] = bounds[property]?.additive
      ? (values[property] ?? 0) + value
      : (values[property] ?? 1) * value;
  }
  return values;
};
