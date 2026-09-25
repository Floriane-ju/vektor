---
{
  "id": "T-0061",
  "titre": "Bornes à la saisie : plages, croissance spirale, champ vidé",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "persistance",
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

Le panneau accepte ce que l'import refuse, donc le dessin change au rechargement :
- `updateInterpolationRange` (`scene.js:766-771`) ne borne pas ; une échelle
  saisie à 999 % revient à 300 % après import (`clamp` dans `persistence.js:136`).
- La croissance de spirale (`modifiers.js:86`, `(1 + radiusStep / 100) ** i`) n'a
  ni min ni max : Infinity puis `0 * Infinity = NaN` dans les attributs SVG ;
  sous -100 % le facteur devient négatif.
- `num()` (`persistence.js:101`) et `bind` (`property-panel.js:152-157`) font
  `Number(null) === 0`, `Number('') === 0` : `strokeWidth: null` importe un trait
  invisible, vider un champ pour retaper écrit 0 en passant.

## Critères d'acceptation

- [x] Les transitions bornent avec `RANGE_BOUNDS`, comme l'import : même valeur avant et après rechargement.
- [x] Croissance de spirale bornée ; aucune coordonnée non finie n'atteint le SVG.
- [x] `null` et `""` ne deviennent jamais 0 (repli sur la valeur par défaut / champ ignoré).
