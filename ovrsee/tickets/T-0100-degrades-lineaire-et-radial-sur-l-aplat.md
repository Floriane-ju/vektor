---
{
  "id": "T-0100",
  "titre": "Dégradés linéaire et radial sur l'aplat",
  "colonne": "a-specifier",
  "priorite": "basse",
  "charge": "m",
  "tags": [
    "rendu"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

Aplat et trait sont d'une couleur unie (seule l'interpolation `color` fait varier
la teinte d'une copie à l'autre). Aucun `<linearGradient>`/`<radialGradient>`
dans `renderer-svg.js`. Les dégradés « néon » sont un marqueur du style visé.

## Critères d'acceptation

- [ ] **À trancher** : dégradé par copie (boîte de la forme, `objectBoundingBox`)
      ou sur tout le calque (`userSpaceOnUse`) ; trait concerné ou aplat seul.
- [ ] Une fois tranché : réglage type (aucun / linéaire / radial) + deux couleurs
      + angle au panneau de la forme ; SVG et PNG exportés le portent.
- [ ] Compatible plan 3D (face avant) et booléens, ou refus explicite au panneau.
- [ ] `FORMAT` bumpé, anciens fichiers relus sans dégradé.
