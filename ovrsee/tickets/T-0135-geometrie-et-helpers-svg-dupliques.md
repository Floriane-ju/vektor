---
{
  "id": "T-0135",
  "titre": "Géométrie et helpers SVG dupliqués",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "rendu",
    "harmonisation"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

- `svgNode` (`src/renderer-svg.js:658`) contourné par `createElementNS` + `setAttribute` : `:38`, `:221`, `:330`, `:347`, `:894`, `:928`, `src/ui/gestures.js:227`, `:355` ; `guideNode` `:242` = `svgNode` + arrondi.
- `outlinePoints` (`renderer-svg.js:758`) ≈ `outlinePath` (`plane.js:79`), `CURVE_SAMPLES = 64` défini deux fois (`renderer-svg.js:754`, `plane.js:19`), sommets de polygone refaits `:782-786` au lieu de `polygonVertices`.
- retournement + rotation d'une copie ×3 : `plane.js:86`, `renderer-svg.js:412-416`, `:805-808`.
- degrés → radians ×5 : `hidden.js:27`, `plane.js:15`, `renderer-svg.js:756` (nommé `degrees` alors qu'il renvoie des radians), inline `renderer-svg.js:376`, `scene.js:236`, `modifiers.js:104`.
- boîte englobante ×5 : `hidden.js:42`, `renderer-svg.js:817-825`, `scene.js:211-214`, `ui/settings.js:87-89`, `ui/gestures.js:251`.
- `extrusion(child.plane, child.height * (child.scale ?? 1))` ×3 : `renderer-plane.js:45`, `renderer-svg.js:403`, `:812`.
- `Math.min(max, Math.max(min, v))` ~15 fois sans `clamp` partagé ; epsilons inline (`renderer-plane.js:46,59`, `hidden.js:182`) alors que `EPSILON` existe.
- homonymes à sens différents : `round` (`renderer-svg.js:1010` chaîne 3 déc., `ui/settings.js:67` nombre 2 déc.), `lerp` (`path.js:29` points, `interpolate.js:54` scalaires).

## Critères d'acceptation

- [ ] Un helper exporté par opération (`radians`, `clamp`, `boxOf`, `placer`, `extrusionOf`), réutilisé partout.
- [ ] `childBounds` lit `outlinePath` ; un seul `CURVE_SAMPLES`.
- [ ] Le chrome SVG et les gestes passent par `svgNode`.
- [ ] `pnpm test` vert, bench `BENCH=1` sans régression.
