---
{
  "id": "T-0020",
  "titre": "Pivot éditable, et propre à chaque modificateur",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "modificateurs",
    "ui"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0018"
}
---

## Contexte

`layer.center` est fixé au milieu du plan de travail à la création du calque et
n'est éditable nulle part : ni champ au panneau, ni poignée au canvas. Les
repères le montrent mais on ne peut pas le saisir. Composer une couronne
décentrée demande donc de déplacer toutes les formes autour d'un point qu'on ne
peut pas viser.

Second manque : un seul centre pour toute la pile. Une couronne dont chaque
branche est elle-même une petite spirale demande deux pivots distincts.

## Critères d'acceptation

- [x] Le centre se règle par deux champs numériques et se déplace à la souris
      par la croix de repère.
- [x] Chaque modificateur peut définir son propre pivot ; à défaut il reprend
      celui du calque.
- [x] Le repère affiché correspond au pivot effectivement utilisé par l'étage.
- [x] Le pivot survit à l'export et au réimport JSON.
