---
{
  "id": "T-0139",
  "titre": "Fichiers et fonctions au-delà des plafonds",
  "colonne": "fait",
  "priorite": "basse",
  "charge": "l",
  "tags": [
    "structure"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

- Fichiers > 800 lignes : `src/scene.js` (1275), `src/renderer-svg.js` (1089).
- Fonctions > 80 lignes : `mountSettings` (`ui/settings.js:172`, 114), `mountDrawingTabs` (`ui/drawing-tabs.js:18`, 112),
  `parseD` (`path.js:85`, 111), `createNode` (`renderer-svg.js:470`, 93), `drawLayer` (`renderer-svg.js:33`, 85),
  `mountLayerPanel` (`ui/layer-panel.js:219`, 84).
- Imbrication 6 : `ui/layer-panel.js:280-287` (rappel de reconstruction) → extraire `foldTransition()`.

Piste : sortir de `renderer-svg.js` le chrome d'écran (≈215-360, 840-1006) et les boîtes
(750-875) ; de `scene.js` les bornes et constantes. À faire après T-0135, qui déplace déjà une partie.

## Critères d'acceptation

- [ ] Aucun fichier de `src/` au-delà de 800 lignes.
- [ ] Architecture de CLAUDE.md mise à jour (nouveaux modules).
- [ ] `pnpm test` vert.
