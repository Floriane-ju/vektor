---
{
  "id": "T-0108",
  "titre": "Poignées de transformation du cadre de sélection",
  "colonne": "a-specifier",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Sorti de T-0074. Le cadre de sélection (`frame` dans `renderer-svg.js`) n'a pas
de poignées : taille et rotation ne se règlent qu'au panneau.

## Critères d'acceptation

- [ ] **À trancher** : poignées sur la copie source seulement, ou sur le calque entier ?
- [ ] **À trancher** : sur une multi-sélection, transformer le groupe autour de sa boîte commune ?
- [ ] Glisser une poignée d'angle/bord redimensionne (`rx`/`ry`), une poignée dédiée tourne ; un seul pas d'historique.
