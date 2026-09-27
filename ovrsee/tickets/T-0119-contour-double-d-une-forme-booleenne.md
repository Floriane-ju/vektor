---
{
  "id": "T-0119",
  "titre": "Contour double d'une forme booléenne",
  "colonne": "en-cours",
  "priorite": "haute",
  "tags": ["booleens", "3d"],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null
}
---

## Contexte

En 2D, le contour double d'une forme booléenne est la somme des contours
doubles de chaque forme, coupés aux jonctions : les traits ne se raccordent
pas. En 3D, le contour double disparaît sur une forme booléenne extrudée.

## Critères d'acceptation

- [ ] 2D : contour double d'une forme booléenne = un seul contour double continu autour de la forme résultante.
- [ ] 3D : la forme booléenne extrudée garde son contour double (anneau).
- [ ] Test de rendu couvrant les deux cas.
