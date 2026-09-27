---
{
  "id": "T-0122",
  "titre": "Poignées du cadre aimantées à la grille",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null
}
---

## Contexte

Redimensionner une forme par les poignées du cadre (T-0108) ignore la grille, alors que dessin, déplacement, sommets et pivots s'y aimantent.

## Critères d'acceptation

- [ ] Grille active, une forme posée sur la grille et redimensionnée par un côté ou un coin garde ses bords sur la grille.
- [ ] Grille éteinte, le geste reste libre.
