---
{
  "id": "T-0078",
  "titre": "Couleur et épaisseur portées par la forme",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["modele", "ui"],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

La couleur (`stroke`) et l'épaisseur (`strokeWidth`) vivent sur le calque : toutes
les formes d'un calque se peignent pareil. On veut pouvoir mêler des couleurs et
des épaisseurs dans un même calque.

## Critères d'acceptation

- [ ] Couleur et épaisseur se règlent dans le panneau de la forme, plus dans celui du calque.
- [ ] Une nouvelle forme reprend la couleur et l'épaisseur de la dernière forme créée (forme active, sinon dernière du calque, sinon défauts).
- [ ] Les interpolations d'épaisseur (facteur) et de couleur s'appliquent toujours.
- [ ] Format bumpé ; un ancien fichier recopie le style du calque sur chacune de ses formes (même dessin).
