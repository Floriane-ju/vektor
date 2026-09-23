---
{
  "id": "T-0019",
  "titre": "Les modificateurs orientent les copies",
  "colonne": "backlog",
  "priorite": "haute",
  "tags": ["modificateurs","rendu"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0018"
}
---

## Contexte

`axial` et `spiral` font tourner la **position** d'une forme autour du centre,
sans toucher à son orientation. Une couronne de six rectangles rend donc six
rectangles droits posés en cercle, au lieu des six rectangles rayonnants que
montre la planche. Le miroir a le même défaut : le reflet d'une forme orientée
n'est pas retourné.

La transformation est déjà une similitude — même angle pour tous les points de
la copie. Il suffit qu'elle rende aussi l'angle qu'elle a appliqué, et que le
rendu l'ajoute à la rotation propre de la forme (T-0013).

Suivre le pivot ne doit pas être imposé : une grille de carrés droits répartis
en cercle est un motif légitime. Le comportement se règle par modificateur.

## Critères d'acceptation

- [ ] Chaque modificateur rend, en plus de la position, l'angle et le
      retournement qu'il applique à la copie.
- [ ] Une case « Orienter les copies » par modificateur, active par défaut sur
      `axial` et `spiral`.
- [ ] Rectangle + `axial` n = 6, orientation active ⇒ six rectangles rayonnants
      régulièrement répartis.
- [ ] Ligne + `mirrorH` ⇒ le reflet est bien le symétrique, pas une copie
      translatée.
