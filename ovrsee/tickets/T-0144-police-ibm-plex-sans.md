---
{
  "id": "T-0144",
  "titre": "Police du texte : IBM Plex Sans",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "charge": "s"
}
---

## Contexte

Essai : remplacer General Sans par IBM Plex Sans pour le texte de l'interface.

## Critères d'acceptation

- [x] IBM Plex Sans (variable, OFL) livrée dans `public/fonts/` avec `@font-face`.
- [x] `--font` pointe dessus ; graisses 400/500/600 rendues.
- [x] `pnpm test` et `pnpm build` passent.
