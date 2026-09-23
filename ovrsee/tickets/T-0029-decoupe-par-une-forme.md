---
{
  "id": "T-0029",
  "titre": "Découpe d'un calque par une forme",
  "colonne": "a-specifier",
  "priorite": "moyenne",
  "tags": ["rendu"],
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

`<clipPath>` le fait nativement et s'exporte sans perte. Reste à décider d'où
vient la forme de découpe — question ouverte, d'où la colonne.

## Critères d'acceptation

- [ ] **À trancher** : la découpe vient d'un autre calque désigné comme masque,
      ou d'une forme du calque marquée comme telle.
- [ ] Une fois tranché : le calque découpé n'apparaît qu'à l'intérieur de sa
      forme de découpe, à l'écran comme à l'export.
- [ ] La découpe s'inverse (garder le dedans / garder le dehors).
