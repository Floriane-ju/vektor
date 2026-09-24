---
{
  "id": "T-0076",
  "titre": "Découper property-panel.js et toolbar.js, briques de formulaire partagées",
  "colonne": "backlog",
  "priorite": "basse",
  "charge": "m",
  "tags": [
    "code"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

`mountPropertyPanel` est une fonction de ~627 lignes (`property-panel.js:138-765`),
`mountToolbar` ~395 (`toolbar.js:113-508`), pour une règle projet à < 50 lignes.
Les briques `option`/`select`/`field`, `apply`, le bouton « + Ajouter » et les
radios segmentés sont recopiés dans `interpolation-section.js` et
`boolean-section.js` ; `pivotInput` est défini deux fois. La toolbar tient
quatre états de geste parallèles et deux `pointermove`.

## Critères d'acceptation

- [ ] Un seul module de contrôles de formulaire, utilisé par les trois panneaux.
- [ ] Sections couleur, modificateur et forme extraites ; menu Exporter/Importer extrait de la toolbar.
- [ ] Aucune fonction > 100 lignes dans `src/ui/` ; `pnpm test` vert, aucun changement visible.
