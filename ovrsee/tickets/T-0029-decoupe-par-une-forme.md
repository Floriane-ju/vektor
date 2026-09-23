---
{
  "id": "T-0029",
  "titre": "Booléens entre formes d'un calque",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": [
    "rendu"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

Les demi-disques rayés, le globe quadrillé coupé net, le damier enfermé dans un
cercle : ces éléments de la planche sont un motif plein découpé par un
contour. Aujourd'hui il faudrait dessiner chaque fragment à la main, et tout
recommencer au moindre réglage.

Tranché : l'opération se fait **entre deux formes d'un même calque**, en
booléen façon pathfinder. Une forme B empile des opérations (« Booléen »),
chacune avec un outil — une autre forme du calque — et un mode : fusion,
découpe ou intersection, appliquées dans l'ordre. Les outils ne se dessinent
plus ; B rend le résultat avec son propre style, contour de
la zone résultante compris. Sous une pile de modificateurs, chaque copie de B
opère avec la copie de A du même rang. Rendu par `<mask>`, qui s'exporte.

## Critères d'acceptation

- [x] **Tranché** : booléen entre deux formes du même calque.
- [ ] Les opérations s'additionnent : chaque étape a son outil et son mode,
      appliquée au résultat de la précédente.
- [ ] Fusion, découpe et intersection rendent le contour et le remplissage de
      la zone résultante, à l'écran comme à l'export ; l'outil, lui, ne se
      dessine pas.
- [ ] Chaque copie d'une pile de modificateurs opère avec sa propre copie de
      l'outil.
- [ ] Dans la liste des formes, l'outil se range sous la forme qui l'emploie,
      relié par un filet d'arborescence.
