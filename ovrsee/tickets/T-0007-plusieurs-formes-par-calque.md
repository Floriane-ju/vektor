---
{
  "id": "T-0007",
  "titre": "Plusieurs formes par calque",
  "colonne": "fait",
  "priorite": "haute",
  "charge": "m",
  "tags": [
    "core",
    "ui"
  ],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

Un calque ne portait qu'une forme : chaque geste de dessin remplacait la
precedente. Composer un motif demandait donc un calque par forme, alors que le
modificateur doit justement s'appliquer a un motif entier.

## Criteres d'acceptation

- [x] Un calque porte une liste de formes ; chaque geste en ajoute une.
- [x] Le modificateur transforme le calque entier : les formes d'une meme copie
      gardent leurs positions relatives et partagent opacite et echelle.
- [x] La liste des formes permet selection, reordonnancement et suppression.
- [x] Les projets aux formats v1 et v2 se rechargent, leur forme unique devenant
      une liste d'une forme.
