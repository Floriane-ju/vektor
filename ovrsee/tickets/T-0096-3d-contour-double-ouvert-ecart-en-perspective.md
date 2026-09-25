---
{
  "id": "T-0096",
  "titre": "3D : contour double ouvert — écart en perspective",
  "colonne": "en-cours",
  "priorite": "haute",
  "tags": ["3d", "rendu"],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Sur un plan 3D, le contour double fermé (anneau) décale ses deux traits dans
le repère du plan : l'écart s'écrase avec la perspective. Un contour double
ouvert (ruban d'un point répété linéairement, ligne, arc, tracé ouvert) est
évidé à l'écran (`hollowStroke`, `openBand`) : écart constant, faux en 3D.

## Critères d'acceptation

- [ ] Contour double ouvert sur un plan : deux traits décalés dans le plan
      puis projetés, avec ou sans profondeur.
- [ ] La bande extrudée (`openBand`) suit les mêmes bords.
- [ ] Test de rendu qui échoue sans le correctif.
