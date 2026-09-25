---
{
  "id": "T-0106",
  "titre": "Jetons CSS : couleurs, rayons, tailles de police et d'icônes",
  "colonne": "fait",
  "priorite": "basse",
  "charge": "s",
  "tags": [
    "ui",
    "code"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

`style.css` a ses variables (`--text`, `--bg-field`, `--radius`…) mais des valeurs
leur échappent : `#fff` (`:191`, `:315`), `#4a4a4a` sans variable (`:399`, `:602`),
rayons 6 px (`:675`) et 2 px (`:575`) hors de `--radius`/`--radius-panel`, sept
tailles de police sans échelle, icônes appelées en 12/14/16/20 px sans constante
(`icons.js`). Chaque retouche de thème oblige à tout relire.

## Critères d'acceptation

- [ ] Aucune couleur littérale hors de `:root` (`grep -nE '#[0-9a-f]{3,6}' style.css`
      ne renvoie que des déclarations de variables).
- [ ] Rayons via variables ; échelle de police (≤ 5 tailles) en variables.
- [ ] Tailles d'icônes en constantes nommées dans `icons.js`.
- [ ] Aucun changement visible (capture avant/après identique au pixel près hors
      écarts voulus et listés).
