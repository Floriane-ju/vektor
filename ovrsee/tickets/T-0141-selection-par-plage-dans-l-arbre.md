---
{
  "id": "T-0141",
  "titre": "Sélection par plage dans l'arbre (Maj) et ajout à la sélection (⌘)",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": null
}
---

## Contexte

Comme Figma / Illustrator : dans la liste des formes, Maj+clic sélectionne toutes les formes entre la forme active et la forme cliquée ; ⌘/Ctrl+clic ajoute ou retire une forme seule.

## Critères d'acceptation

- [x] ⌘/Ctrl+clic dans l'arbre : bascule la forme (ancien Maj+clic).
- [x] Maj+clic dans l'arbre : ajoute à la sélection la plage entre la forme active (ancre, qui reste active) et la forme cliquée.
- [x] Transition pure `selectRange` testée.
