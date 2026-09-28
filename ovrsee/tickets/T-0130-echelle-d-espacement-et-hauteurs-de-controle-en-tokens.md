---
{
  "id": "T-0130",
  "titre": "Échelle d'espacement et hauteurs de contrôle en tokens",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "ui",
    "design-system",
    "css"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

`style.css` n'a aucun token d'espacement ni de hauteur : tout est en px bruts.

- gap/padding/margin : 2/4/6/8/10/12/14/16/24 px, ~50 occurrences. Hors échelle :
  `10px` (`:175`, `:314`, `:702`), `14px` (`:224`, `:256`), `30px` (`:577`).
- hauteurs : `36px` ×8, `40px` ×3, `28px` ×3, `24px` ×8, `44px` ×3.
- décalage des panneaux flottants `24px` ×7, `16px` ×3, `72px` ×2 ; `calc(var(--gutter-right) - 48px)` `:700`.
- largeurs de panneau `288px` (`:307`) et `312px` (`:312`) non reliées aux gouttières
  (`--gutter-left` 336 = 288 + 2×24, `--gutter-right` 360 = 312 + 2×24).

Correctif : `--space-1…6` (2/4/8/12/16/24), `--control-h` (36), `--control-h-sm` (28),
`--row-h` (40), `--float-inset` (24), largeurs de panneau en tokens et gouttières dérivées
par `calc()`. Ramener 10/14/30 sur l'échelle.

## Critères d'acceptation

- [ ] Aucune valeur px d'espacement ou de hauteur de contrôle hors `:root`.
- [ ] Les gouttières sont calculées depuis les largeurs de panneau et `--float-inset`.
- [ ] Rendu identique avant/après (capture de l'interface), hors les valeurs hors échelle ramenées.
