---
{
  "id": "T-0094",
  "titre": "Plan de travail infini plein écran",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

La zone de dessin est un carré de 900×900 cerné d'un cadre au milieu de l'écran.
C'est du SVG : rien n'impose de limite, on veut dessiner sur tout l'écran.

## Critères d'acceptation

- [ ] Le `<svg>` couvre tout l'écran, sous les panneaux ; plus de cadre ni de légende « Zone de dessin ».
- [ ] Molette / trackpad déplace la vue, Ctrl/⌘ + molette zoome sous le pointeur, « Ajuster » recadre sur le dessin.
- [ ] Dessiner, glisser, aimanter fonctionnent n'importe où, au-delà des anciennes bornes.
- [ ] La grille couvre toute la zone visible.
- [ ] Les masques (booléens, 3D, contour double) ne coupent plus le dessin hors de l'ancien carré.
- [ ] L'export SVG/PNG est cadré sur le dessin.
