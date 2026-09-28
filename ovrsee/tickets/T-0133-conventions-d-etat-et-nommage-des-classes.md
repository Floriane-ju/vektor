---
{
  "id": "T-0133",
  "titre": "Conventions d'état et nommage des classes",
  "colonne": "fait",
  "priorite": "basse",
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

Quatre façons de porter un état : classes `is-*`, `data-x="true"/"false"`
(`data-active`, `data-visible`, `data-locked`), `data-x` de présence (`data-used`,
`data-mixed`, `data-grid`…), ARIA (`aria-pressed`, `aria-expanded`).

- `data-selected` a deux sens : `"layer"`/`"parent"` (`src/ui/layer-panel.js:183`) contre `"true"` (`src/ui/shape-list.js:161`).
- `.layer-card/.layer-row/.layer-name` stylent aussi les lignes de forme (`style.css:379-391`), `.layer-name-input` le renommage d'onglet (`:246`).
- `.swatches` (`src/ui/stroke-card.js:104`) et `.swatch-list` (`:71`) désignent la même chose.

Correctif : écrire la règle (ARIA pour l'état accessible, `data-*` de présence pour
l'état d'exécution, `is-*` pour les variantes fixes) dans CLAUDE.md et renommer.

## Critères d'acceptation

- [ ] `data-selected` n'a plus qu'un sens (celui des formes renommé, ex. `data-in-selection`).
- [ ] Classes de ligne neutres (`.tree-row`…) partagées calques/formes/onglets.
- [ ] Convention d'état documentée dans CLAUDE.md.
