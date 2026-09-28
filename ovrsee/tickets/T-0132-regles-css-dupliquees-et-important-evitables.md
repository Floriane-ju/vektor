---
{
  "id": "T-0132",
  "titre": "Règles CSS dupliquées et !important évitables",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "ui",
    "css",
    "harmonisation"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

Motifs écrits plusieurs fois dans `style.css` :

- `.shape-picker legend` (`:277-283`) recopie `.visually-hidden` (`:55`).
- input natif masqué (`position:absolute; opacity:0; pointer-events:none`) ×3 : `:257`, `:284`, `:585`.
- anneau de focus du substitut ×3 : `:259`, `:296`, `:587`.
- surfaces flottantes `.stroke-palette` / `.menu, .settings` / `.shortcuts` (`:657`, `:712`, `:739`) : même fond, bordure, rayon.
- police de titre `600 var(--text-md)/1` ×5 : `:308`, `:504`, `:669`, `:734`, `:748`.
- `.slider-head` = `.section-head` (`:486` / `:503`).
- `[hidden] { display: none }` rustiné par composant ×5 (`:464`, `:475`, `:534`, `:545`, `:736`).
- état « enfoncé » `background: var(--text); color: var(--ink)` ×3, « accent » ×4.
- `!important` évitables : `.range-value` `:488-490` (sélecteur `input.range-value` suffit), `.hex` `:634` (`input.hex`).
- `#stage[data-tool="cursor"] { cursor: crosshair }` `:125` répète le défaut `:115`.

## Critères d'acceptation

- [ ] Un seul bloc par motif (sélecteurs groupés par `:is()` ou classe partagée).
- [ ] Plus de `!important` hors le coupe-mouvement (`:778-779`).
- [ ] Rendu identique (capture avant/après).
