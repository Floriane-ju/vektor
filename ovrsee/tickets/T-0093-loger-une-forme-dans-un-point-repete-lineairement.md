---
{
  "id": "T-0093",
  "titre": "Loger une forme dans un point répété linéairement",
  "colonne": "revue",
  "priorite": "moyenne",
  "tags": [
    "modele",
    "rendu",
    "3d"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Un point dont la pile porte un étage en répétition linéaire devient un tracé
(anneau pour l'axial, ruban ouvert pour la spirale). Il doit pouvoir accueillir
une forme logée (`inside`), comme un cercle : typiquement un axe qui traverse
la spirale ou le pentagone extrudé.

## Critères d'acceptation

- [x] Un point avec un étage linéaire est un hôte possible (`isClosedShape`).
- [x] Axial (tracé fermé) : même rendu qu'un cercle (tranches dessous/milieu/dessus).
- [x] Spirale (tracé ouvert) : la forme logée n'est cachée que par les parois
      devant elle, pas par celles derrière.
- [x] Les tests existants passent.
