---
{
  "id": "T-0011",
  "titre": "Pile d'interpolations par calque",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "noyau",
    "ui"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

L'interpolation était un réglage figé du calque : deux plages, une par
propriété, et rien d'autre. On ne pouvait pas en poser deux sur la même
propriété — éteindre les copies d'un miroir *et* celles de toute la pile
demandait de choisir laquelle des deux.

Le modificateur, lui, s'empile depuis longtemps : on en ajoute, on en retire,
on en règle le type, et sa card le montre. L'interpolation doit fonctionner de
la même façon, au même endroit — la rampe d'une interpolation se lie à un étage
de la pile voisine, les deux se lisent d'un seul coup d'œil.

## Critères d'acceptation

- [x] On ajoute et on retire des interpolations depuis la card du calque, comme
      des modificateurs.
- [x] Chaque interpolation choisit sa propriété — opacité ou échelle.
- [x] Deux interpolations d'une même propriété se composent au lieu de
      s'écraser, dans n'importe quel ordre.
- [x] Chaque interpolation se lie au choix à la rampe globale ou à un étage de
      la pile de modificateurs du calque.
- [x] Remuer la pile de modificateurs emmène les liaisons ; supprimer l'étage
      lié ramène l'interpolation à la rampe globale.
- [x] La pile survit à l'aller-retour JSON ; un fichier antérieur se relit avec
      une interpolation par plage non neutre.
