---
{
  "id": "T-0152",
  "titre": "Booléen avec toutes les copies de l'outil",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "rendu"
  ],
  "cree": "2026-10-25",
  "maj": "2026-10-25",
  "plan": null,
  "fait": "2026-10-25T12:00:44.615Z"
}
---

## Contexte

Un outil booléen répété par sa propre pile n'agit que par sa copie propre de même rang (ou sa première, sous une forme non répétée). On veut qu'il agisse par toutes ses copies propres : disque moins une couronne de trous faite par l'axial de l'outil.

## Critères d'acceptation

- [x] Chaque copie de la forme se combine avec l'union de toutes les copies propres de l'outil de même copie du calque.
- [x] Union, soustraction et intersection justes, à plat (masques) comme en vrai contour (3D, contour double).
- [x] Les copies du calque restent appariées par rang.
