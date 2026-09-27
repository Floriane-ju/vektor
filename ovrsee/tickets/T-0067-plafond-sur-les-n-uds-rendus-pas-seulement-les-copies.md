---
{
  "id": "T-0067",
  "titre": "Plafond sur les nœuds rendus, pas seulement les copies",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "xs",
  "tags": [
    "perf",
    "modificateurs"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-27",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

`isSuspended` (`scene.js:414`) compare `copyCount(layer.modifiers)` à
`MAX_COPIES`, mais chaque copie répète toutes les formes du calque (`:427`) :
2000 copies × 100 formes = 200 000 nœuds, sans suspension. L'onglet se fige,
précisément ce que le garde-fou devait éviter.

## Critères d'acceptation

- [x] Le calque est suspendu quand copies × formes dépasse le seuil.
- [x] Le compteur et l'avertissement du panneau reflètent ce produit.
