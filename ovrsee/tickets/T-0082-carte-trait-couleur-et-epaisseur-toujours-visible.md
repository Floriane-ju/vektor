---
{
  "id": "T-0082",
  "titre": "Carte trait : couleur et épaisseur toujours visibles",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

Couleur et épaisseur de trait sont enfouies dans le panneau de la forme. Comme dans Illustrator, elles doivent rester accessibles en permanence.

## Critères d'acceptation

- [x] Une carte en haut à droite, à gauche de la pastille annuler/rétablir, montre la couleur et l'épaisseur de la forme active.
- [x] Cliquer la pastille de couleur ouvre un popover : palette globale (couleurs du dessin) + sélecteur de couleur + hex.
- [x] L'épaisseur se règle depuis la carte.
- [x] Couleur et épaisseur ne sont plus dans le panneau de la forme.
- [x] Sans forme active, la carte règle couleur et épaisseur des prochaines formes.
