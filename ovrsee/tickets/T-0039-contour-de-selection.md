---
{
  "id": "T-0039",
  "titre": "Contour de sélection à la place du surlignage",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

La sélection repeint toutes les copies de la forme (nuance de couleur, opacité forcée à 1). On veut un anneau cyan détaché de la forme, sur la forme d'origine seulement.

## Critères d'acceptation

- [x] La forme sélectionnée porte un anneau cyan, séparé d'un liseré, sur sa copie source uniquement.
- [x] Plus aucun changement de couleur ni d'opacité à la sélection ou au survol.
- [x] L'export ne contient pas l'anneau.
