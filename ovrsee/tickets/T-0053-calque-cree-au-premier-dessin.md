---
{
  "id": "T-0053",
  "titre": "Dessiner sans calque en crée un automatiquement",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

Sans calque, dessiner sur le plan affiche « Sélectionner un calque avant de
dessiner. » et ne fait rien. Autant créer le calque.

## Critères d'acceptation

- [x] Sans calque actif, un geste de dessin crée un calque puis la forme.
- [x] Un seul ⌘Z annule les deux.
