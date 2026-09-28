---
{
  "id": "T-0128",
  "titre": "Keyframe row-glow référencée mais jamais définie",
  "colonne": "fait",
  "priorite": "haute",
  "charge": "xs",
  "tags": [
    "ui",
    "animation",
    "bug"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

`style.css:800` et `style.css:844` listent `row-glow 480ms var(--ease) backwards` dans
`animation`, mais aucune `@keyframes row-glow` n'existe (et n'a jamais existé,
`git log -S row-glow`). Le navigateur ignore ce membre : la lueur brève promise par les
commentaires sur les lignes et blocs apparus ne joue jamais.

Correctif : définir `@keyframes row-glow` (fondu depuis `--accent-tint` par ex.), ou
retirer ce membre des deux listes.

## Critères d'acceptation

- [ ] Une ligne ajoutée (forme, calque, étage) montre la lueur, dans Chromium et Firefox.
- [ ] Rien ne s'anime avec `html[data-motion="off"]`.
- [ ] Plus aucune animation référencée sans `@keyframes` (grep des noms d'`animation`).
