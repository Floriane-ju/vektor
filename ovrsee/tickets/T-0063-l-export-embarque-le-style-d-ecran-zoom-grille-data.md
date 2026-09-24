---
{
  "id": "T-0063",
  "titre": "L'export embarque le style d'écran (zoom, grille, data-*)",
  "colonne": "fait",
  "priorite": "haute",
  "charge": "xs",
  "tags": [
    "export",
    "rendu"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": "2026-09-24-tickets-issus-du-tour-de-code-2026-09-24.md",
  "epic": "T-0026"
}
---

## Contexte

`toSvgDocument` (`renderer-svg.js:649-662`) clone `#stage` et ne retire que `id`,
`role`, `aria-label`. Le `style` posé par le zoom (`zoom.js:63-65`, `width`,
`maxWidth`) et par la grille (`settings.js:138`, `backgroundImage`) part dans le
fichier, avec `data-tool`, `data-grid`, `data-dragging`… Un SVG exporté à
800 % s'ouvre à 7200 px ; la grille se retrouve en fond du fichier, et du PNG
qui part du même document.

Au passage, le fichier porte du bruit d'écran sur chaque nœud :
`data-element-id`, `data-layer-id`, `pointer-events`, `fill-opacity="1"`.

## Critères d'acceptation

- [ ] La racine exportée n'a ni `style` ni attribut `data-*`.
- [ ] Exporter à 800 % grille active donne un fichier identique à l'export à 100 % sans grille.
- [ ] Les nœuds exportés n'ont plus d'attributs d'écran ; opacités à 1 omises.
- [ ] Test de rendu sur ces deux points.
