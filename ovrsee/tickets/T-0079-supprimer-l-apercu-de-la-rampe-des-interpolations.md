---
{
  "id": "T-0079",
  "titre": "Supprimer l'aperçu de la rampe des interpolations",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

La section d'une interpolation affiche sous le curseur une rangée de pastilles
(`ramp-preview`) qui double ce que le plan montre déjà. Demandé en retrait.

## Critères d'acceptation

- [ ] Plus de pastilles d'aperçu dans la section interpolation.
- [ ] Code (`preview`, `PREVIEW_DOTS`) et CSS `.ramp-preview` retirés.
- [ ] `pnpm test` passe.
