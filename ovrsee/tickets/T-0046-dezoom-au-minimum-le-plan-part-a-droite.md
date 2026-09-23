---
{
  "id": "T-0046",
  "titre": "Dézoom au minimum : le plan part à droite",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": [
    "ui",
    "bug"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

Dézoomer alors que le zoom est déjà au minimum envoie le plan très loin vers la
droite. `--slack-*` est posé en padding de `.stage-wrap` (fixe, `inset: 0`) :
quand les deux paddings dépassent la largeur, la boîte s'élargit, `clientWidth`
grossit, la marge suivante aussi — boucle, ×2 par cran.

## Critères d'acceptation

- [ ] Dézoomer au minimum (molette, bouton, clavier) ne déplace plus le plan.
- [ ] `.stage-wrap` garde la taille de la fenêtre quel que soit le zoom.
- [ ] Le plan dézoomé défile toujours jusqu'à toucher chaque bord (T-0043).
