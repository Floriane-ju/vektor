---
{
  "id": "T-0117",
  "titre": "Retirer les formes logées (« à l'intérieur de »)",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "m",
  "tags": [
    "3d",
    "modele"
  ],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": "2026-09-27-profondeur-reelle-dans-un-calque-3d-lignes-cachees-fin-des-f.md"
}
---

## Contexte

Avec la profondeur réelle (T-0116), être « dedans » découle de la position de
la forme dans le dessin : le lien `element.inside` n'a plus lieu d'être.

## Critères d'acceptation

- [ ] Plus de champ « À l'intérieur de » dans le panneau, plus de branche pointillée dans l'arbre.
- [ ] `element.inside`, `setInside`, `insideLoop`, `createInside` supprimés.
- [ ] Format `@33` ; les fichiers `@32` et antérieurs se relisent, `inside` ignoré.
- [ ] CLAUDE.md à jour.
