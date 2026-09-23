---
{
  "id": "T-0050",
  "titre": "Couleurs du calque et des autres calques dans le nuancier",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

Le nuancier ne montre que la palette fixe : une couleur choisie à la main
(dont la couleur par défaut) n'y apparaît pas, et rien n'indique quelles
couleurs portent déjà les autres calques — réaccorder deux calques demande de
recopier l'hexadécimal.

## Critères d'acceptation

- [x] La couleur du calque actif est cerclée dans le nuancier, même hors
      palette.
- [x] Les couleurs des autres calques y figurent, marquées, et un clic les
      applique au calque actif.
- [x] Sans doublon : une couleur de la palette déjà employée n'apparaît
      qu'une fois.
