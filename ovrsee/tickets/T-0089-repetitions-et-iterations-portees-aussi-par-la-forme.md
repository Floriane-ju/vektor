---
{
  "id": "T-0089",
  "titre": "Répétitions et itérations portées aussi par la forme",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "modificateurs",
    "modele",
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": "2026-09-25-repetitions-et-iterations-portees-aussi-par-la-forme-format.md",
  "charge": "l"
}
---

## Contexte

Seul le calque porte répétitions (modificateurs) et itérations (interpolations). Une forme doit pouvoir porter les siennes, cumulées à celles du calque (forme d'abord, puis calque). La répétition linéaire d'un point ne suit plus que sa propre pile. Le plan 3D reste au calque.

## Critères d'acceptation

- [ ] Panneau forme : sections « Répéter » et « Faire varier les itérations » propres à la forme.
- [ ] Copies de la forme × copies du calque ; pivot par défaut = pivot du calque.
- [ ] Interpolations de forme composées avec celles du calque (couleur de la forme l'emporte).
- [ ] Case « Répétition linéaire » d'un point visible seulement s'il a sa propre répétition ; case par étage uniquement dans la pile du point.
- [ ] Format `@25` ; fichiers `@24` relus (liens linéaires via le calque oubliés).
- [ ] `pnpm test` et `pnpm build` verts.
