---
{
  "id": "T-0021",
  "titre": "Miroir d'axe libre",
  "colonne": "backlog",
  "priorite": "basse",
  "tags": ["modificateurs"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0018"
}
---

## Contexte

`mirrorH` et `mirrorV` ne réfléchissent que sur les axes vertical et horizontal
passant par le centre. Les symétries diagonales de la planche — les étoiles à
quatre branches, les motifs en X — demandent un axe incliné, aujourd'hui
impossible autrement qu'en inclinant toutes les formes à la main.

Un angle d'axe suffit : les deux miroirs existants en deviennent les cas à 90°
et 0°, et leur comportement ne change pas.

## Critères d'acceptation

- [ ] Un champ « Angle de l'axe » sur les modificateurs miroir.
- [ ] À 0° et 90°, le rendu est identique à celui d'aujourd'hui.
- [ ] Le repère de l'axe suit l'angle réglé.
