---
{
  "id": "T-0095",
  "titre": "3D : parois de rubans répétés (spirale puis axial) se cachent mutuellement",
  "colonne": "fait",
  "priorite": "haute",
  "tags": ["3d", "rendu"],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Un point répété en spirale (linéaire) puis en miroir axial donne plusieurs
rubans entrelacés. Chaque ruban cache ses propres arêtes (`createWalls`), mais
pas celles des autres copies : on voit à travers les murs. Une forme logée
(axe) n'est cachée que par la copie propre 0 de son hôte.

## Critères d'acceptation

- [ ] Les arêtes du fond et de flanc d'un ruban sont découpées par les parois
      et la face du haut des autres rubans du calque de même extrusion.
- [ ] Une forme logée dans un ruban répété est cachée par les parois de toutes
      ses copies propres devant elle.
- [ ] Tests de rendu qui échouent sans le correctif.
