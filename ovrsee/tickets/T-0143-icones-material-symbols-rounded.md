---
{
  "id": "T-0143",
  "titre": "Icônes Material Symbols Rounded (graisse 100)",
  "colonne": "revue",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": "2026-09-29-icones-material-symbols-rounded-graisse-100.md",
  "charge": "m"
}
---

## Contexte

Les icônes de l'interface mêlent SVG maison et glyphes texte (`×`, `↑`, `⧉`, `⚙`, `+`). La typo variable Material Symbols Rounded doit les remplacer toutes, sauf les pictos sur mesure des outils de forme et les aperçus de la liste des formes.

## Critères d'acceptation

- [ ] Police servie depuis `public/fonts/`, graisse 100.
- [ ] Plus aucun glyphe texte servant d'icône dans `src/ui/`.
- [ ] Outils de forme et aperçus restent en SVG.
- [ ] `CLAUDE.md` interdit les icônes ASCII/Unicode.
- [ ] `pnpm test` et `pnpm build` passent.
