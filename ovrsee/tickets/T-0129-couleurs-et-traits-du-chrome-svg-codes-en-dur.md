---
{
  "id": "T-0129",
  "titre": "Couleurs et traits du chrome SVG codés en dur",
  "colonne": "en-cours",
  "priorite": "haute",
  "charge": "s",
  "tags": [
    "ui",
    "design-system",
    "rendu"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

Le chrome d'écran du plan (poignées, cadres, repères) contourne les tokens :

- `src/renderer-svg.js:223-225` — poignées de sommets `fill #1b1b1b`, `stroke #ee4722`, `stroke-width 2`.
- `src/renderer-svg.js:930-932` — cadre de transformation : `setAttribute('stroke', 'var(--accent, #ee4722)')`.
  Le commentaire `:745` rappelle qu'un attribut de présentation ne lit pas `var()` :
  le cadre est peut-être sans trait. **À vérifier dans Chromium et Firefox.**
- `src/renderer-svg.js:335-338` — gris des repères `#a2a8b4`, sans token ; `1`, `0.45`, `6 6` bruts.
- `src/renderer-svg.js:748-752` — `FRAME_COLORS` : trois fois la même valeur, avec repli hex.
- `src/renderer-svg.js:848-853`, `src/ui/gestures.js:233,361` — épaisseurs/tirets bruts (`1.5`, `6 4`, `4 4`, `0.6`).
- `src/ui/settings.js:177` — repli `'#303030'` recopie `--grid`.
- `src/ui/stroke-card.js:19-20` — `PALETTE` recopie `#ee4722`/`#fcfaf3` (`--accent`/`--text`).

Correctif : passer par `el.style.fill/stroke = 'var(--…)'` comme `renderer-svg.js:852` ;
token `--guide` ; épaisseurs et tirets du chrome dans une constante unique.

## Critères d'acceptation

- [ ] Changer `--accent` dans `:root` recolore poignées, cadre de sélection et cadre de transformation.
- [ ] Le cadre de transformation a un trait visible dans Chromium et Firefox.
- [ ] Export SVG inchangé (repères et poignées toujours retirés par `toSvgDocument`).
- [ ] Plus de hex d'interface dans `renderer-svg.js`, `gestures.js`, `settings.js` (hors masques).
