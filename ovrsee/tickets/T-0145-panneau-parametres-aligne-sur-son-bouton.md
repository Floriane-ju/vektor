---
{
  "id": "T-0145",
  "titre": "Panneau Paramètres aligné sur son bouton",
  "colonne": "fait",
  "priorite": "basse",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": null
}
---

## Contexte

Le popover Paramètres est calé en CSS sur le bord gauche de la barre du bas
(`--float-inset`), pas sur le bouton qui l'ouvre : décalé quand la barre change
de largeur.

## Critères d'acceptation

- [ ] Le panneau s'ouvre au-dessus du bouton Paramètres, bord droit aligné sur le sien.
