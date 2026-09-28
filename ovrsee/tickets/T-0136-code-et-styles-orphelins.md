---
{
  "id": "T-0136",
  "titre": "Code et styles orphelins",
  "colonne": "en-cours",
  "priorite": "basse",
  "charge": "xs",
  "tags": [
    "code-mort"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

- `parseDash` (`src/scene.js:292`) : aucun appel dans `src/`, seulement `test/core.test.js:1502-1509`.
- `.field-label` (`style.css:477`) : aucune occurrence en JS/HTML.
- `export` superflus (noms utilisés dans leur seul fichier, importés nulle part, même pas en test) :
  `noise`, `lerp` (`interpolate.js`), `GROWTH_BOUNDS` (`modifiers.js`), `polygonPoints`, `arcPath`,
  `projectedPath` (`renderer-svg.js`), `MAX_SIDES`, `MAX_HEIGHT`, `centerPoints`, `DEFAULT_LINECAP`,
  `DEFAULT_BOOLEAN_OP` (`scene.js`), `nextId` (`ui/fields.js`), `restoreFocus` (`ui/list.js`), `clampZoom` (`ui/zoom.js`).
- commentaire de `rotateVector` égaré `src/scene.js:218` (suivi de celui de `scaledPatch`) ; la fonction est `:235`.

Rien d'autre : ni import inutilisé, ni fichier non référencé, ni dépendance morte, ni `console.*`.

## Critères d'acceptation

- [ ] `parseDash` et son test retirés ; `.field-label` retiré du sélecteur.
- [ ] `export` retiré des 14 noms internes.
- [ ] Commentaire de `rotateVector` au-dessus de sa fonction.
- [ ] `pnpm test` et `pnpm build` verts.
