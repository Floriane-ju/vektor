---
{
  "id": "T-0115",
  "titre": "Booléen en 3D : extruder la forme résultante",
  "colonne": "fait",
  "priorite": "haute",
  "tags": ["3d", "booleens"],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null
}
---

## Contexte

Sur un calque en plan 3D, une forme portant des booléens est dessinée à plat
(masques de `createBoolean`) : ni profondeur, ni parois. C'est la forme issue
du booléen qui doit prendre le relief.

## Critères d'acceptation

- [ ] Calque en 3D, forme à profondeur > 0 avec un booléen : le contour résultant (union / soustraction / intersection) est extrudé comme un tracé fermé (parois, arêtes cachées, occlusion).
- [ ] Hors 3D ou sans profondeur, rendu inchangé (masques).
- [ ] Test de rendu couvrant le cas.
