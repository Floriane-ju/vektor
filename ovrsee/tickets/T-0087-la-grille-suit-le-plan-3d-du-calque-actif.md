---
{
  "id": "T-0087",
  "titre": "La grille suit le plan 3D du calque actif",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui",
    "3d"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

L'aimantation se fait déjà dans le repère du plan 3D, mais la grille affichée reste à plat : les points aimantés ne tombent pas sur les croisements visibles.

## Critères d'acceptation

- [x] Calque actif en plan 3D : la grille (carrée ou ronde) est dessinée projetée par `planeMatrix`.
- [x] Changer d'inclinaison/direction ou de calque actif met la grille à jour.
- [x] Calque sans plan : grille à plat, comme avant.
- [x] La grille (carrée et ronde) couvre tout le canvas, en 3D comme à plat ; l'aimantation suit les traits ajoutés.
- [x] Sur un calque en 3D, une forme se dessine sur le plan incliné sans profondeur ; son volume apparaît au relâchement.
