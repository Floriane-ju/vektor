---
{
  "id": "T-0048",
  "titre": "Visibilité du calque en icône d'œil",
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

Le bouton de visibilité d'un calque s'affiche « ◉ » / « ○ » : il se lit comme
un indicateur de sélection, pas comme un interrupteur masquer/afficher.

## Critères d'acceptation

- [x] Le bouton montre un œil ouvert quand le calque est visible, un œil barré
      quand il est masqué.
- [x] Libellé accessible et `aria-pressed` inchangés.
