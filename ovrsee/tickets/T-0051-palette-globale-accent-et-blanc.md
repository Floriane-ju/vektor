---
{
  "id": "T-0051",
  "titre": "Palette globale : accent + blanc, puis les couleurs du dessin",
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

La palette fixe propose cinq couleurs d'office, dont la plupart ne servent pas.
On veut une palette qui reflète le dessin : de base l'accent et le blanc, puis
chaque couleur posée sur un calque.

## Critères d'acceptation

- [x] De base, le nuancier ne propose que l'accent (#EE4722) et le blanc
      (#FCFAF3).
- [x] Toute couleur portée par un calque s'y ajoute, quel que soit le calque
      actif (palette globale au dessin).
- [x] Une couleur qui n'est plus portée par aucun calque en disparaît (hors
      accent et blanc).
