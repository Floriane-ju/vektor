---
{
  "id": "T-0131",
  "titre": "Tokens de mouvement, d'état et de typographie",
  "colonne": "fait",
  "priorite": "basse",
  "charge": "s",
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

Valeurs répétées qui échappent aux tokens de `style.css` :

- durées : `0.12s` (`:566`, = `--dur-fast`), `0.15s` (`:516`), `220ms` (`:878-879`, = `--dur`),
  `240ms` `:880`, `280ms` `:920`, `300ms` ×2 (`:857`, `:859`), stagger `40ms` `:801`.
- échelles : `scale(0.96)` ×3, `scale(0.97)` ×3, `0.92` `:927`, `0.88` `:916`.
- opacités : 0.35, 0.45, 0.5, 0.75 ×3, 0.8 ×2.
- bordure `1.5px` ×8 (anneau `inset 0 0 0 1.5px` ×6).
- anneau de focus `2px solid var(--select)` + `outline-offset: 2px` ×4 (`:87`, `:259`, `:296`, `:587`).
- `color-mix(in srgb, var(--accent) 30%, transparent)` ×2 (`:385`, `:823`).
- graisses 500/600 brutes ; `z-index: 1` ×3.

Correctif : `--dur-slow`, `--stagger`, `--press-scale`, `--enter-scale`, `--hairline`,
`--focus-ring`, `--accent-tint`, `--weight-medium/-bold`, `--z-float`, opacités nommées.

## Critères d'acceptation

- [ ] Chacune de ces valeurs n'apparaît plus qu'une fois, dans `:root`.
- [ ] `pnpm test` vert, rendu identique.
