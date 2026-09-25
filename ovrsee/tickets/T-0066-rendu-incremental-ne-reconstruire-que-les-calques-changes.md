---
{
  "id": "T-0066",
  "titre": "Rendu incrémental : ne reconstruire que les calques changés",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "l",
  "tags": [
    "perf",
    "rendu"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

Chaque notification du store reconstruit tout le SVG (`replaceChildren`,
`renderer-svg.js:22`), y compris un simple changement de sélection, et chaque
`pointermove` d'un glisser. Le calque actif calcule `getRenderedChildren` deux
fois (`:28` et `createSelection`, `:606-609`), `childBounds` échantillonne 65
points par ellipse et copie, et `union` (`:567-572`) fait `Math.min(...)` sur
tous les enfants (`RangeError` possible sous Safari au-delà de ~65 000).

Les transitions étant immuables, une comparaison de référence par calque
suffit : c'est la mesure que demandait la note `ponytail:` de `scene.js:396`.

## Critères d'acceptation

- [ ] Changer de sélection ne recalcule aucun calque ; seule la couche d'écran (sélection, repères, poignées) est refaite.
- [ ] Un calque dont la référence n'a pas changé garde ses nœuds DOM.
- [ ] `getRenderedChildren` n'est appelé qu'une fois par calque et par rendu ; `union` sans étalement.
- [ ] Test : sélection seule → nœuds du calque identiques (même objet DOM).
