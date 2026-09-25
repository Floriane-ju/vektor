---
{
  "id": "T-0092",
  "titre": "Parois 3D d'un tracé lissé en dents de scie",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "rendu",
    "3d",
    "bug"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Point répété en spirale, répétition linéaire lissée, calque en plan 3D avec
profondeur : le bord arrière du ruban extrudé est crénelé là où la courbe
s'aligne sur la direction d'extrusion. Chaque paroi (`createWalls`) masque en
noir un coin du trait de sa voisine plus lointaine, que son propre trait (bout
rond) ne rend pas en entier : une encoche par segment, et le lissage multiplie
les segments.

## Critères d'acceptation

- [x] Un tracé ouvert lissé extrudé n'a plus d'encoches sur son bord arrière.
- [x] Contour double : aucun bout de bord caché ne réapparaît, pas de miettes.
- [x] Pas de masque par paroi (lag) : le bord du fond est découpé par la
      géométrie et tracé d'un seul chemin, comme le bord du haut.
- [x] Arêtes de flanc à pleine épaisseur (découpées par la géométrie, plus rognées par la paroi voisine).
- [x] Bout d'une bande dans un virage serré : bord intérieur sans boucle ni marche (`untangle`).
- [x] Les tests existants passent.
