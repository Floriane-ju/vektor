---
{
  "id": "T-0151",
  "titre": "Répétitions linéaires depuis un répéteur de calque",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["modele", "ui"],
  "cree": "2026-10-22",
  "maj": "2026-10-22",
  "plan": null
}
---

## Contexte

La case « Activer les répétitions linéaires » n'existe que sur la pile d'un point. On veut aussi relier les points d'un calque le long d'un étage de la pile du calque.

## Critères d'acceptation

- [ ] La case apparaît sur un étage du calque (hors `none`) dès que le calque contient un point.
- [ ] Cochée, chaque point du calque devient un tracé reliant ses copies le long de cet étage (axial refermé, lissage possible).
- [ ] Format bumpé ; un `@24` relié le long du calque reste relu en points.
