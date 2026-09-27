---
{
  "id": "T-0108",
  "titre": "Poignées de transformation du cadre de sélection",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-27",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Sorti de T-0074. Le cadre de sélection (`frame` dans `renderer-svg.js`) n'a pas
de poignées : taille et rotation ne se règlent qu'au panneau.

## Critères d'acceptation

- [x] Tranché : poignées sur la copie source de la forme active seulement.
- [x] Tranché : pas de poignées sur une multi-sélection (cadres seuls).
- [x] Glisser une poignée d'angle/bord redimensionne (`rx`/`ry`), une poignée dédiée tourne ; un seul pas d'historique.
