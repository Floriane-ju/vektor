---
{
  "id": "T-0124",
  "titre": "Cadre sur l'origine, reste atténué au survol",
  "colonne": "fait",
  "priorite": "haute",
  "tags": ["ui"],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null
}
---

## Contexte

Le cadre de sélection d'un point relié (répétition linéaire) entoure toute sa chaîne, pas le point d'origine. Rien ne distingue l'origine des répétitions quand on s'apprête à la saisir.

## Critères d'acceptation

- [x] Le cadre de sélection entoure la seule copie d'origine, point relié compris (le point, pas la chaîne).
- [x] Pointeur dans le cadre au curseur : le reste du dessin passe à 80 % d'opacité, l'origine reste pleine — pour un point relié, le point, la chaîne restant atténuée.
- [x] Rien de ce survol ne part à l'export.
