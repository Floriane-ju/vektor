---
{
  "id": "T-0008",
  "titre": "Zoom / dézoom sur le canvas",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": null
}
---

## Contexte

Le plan de travail est figé à sa taille « ajustée » : impossible de zoomer pour
dessiner finement ni de dézoomer.

## Critères d'acceptation

- [ ] Boutons −, +, « Ajuster » et niveau en % dans la barre d'outils.
- [ ] Ctrl/⌘ + molette (et pincement trackpad) zoome autour du curseur.
- [ ] Ctrl/⌘ + `+`/`-`/`0` zoome, dézoome, réajuste.
- [ ] Zoomé, le stage défile dans son conteneur et le dessin tombe toujours sous le curseur.
- [ ] L'export SVG est inchangé (viewBox de la scène).
