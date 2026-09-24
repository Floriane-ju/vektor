---
{
  "id": "T-0068",
  "titre": "Interpolation de couleur",
  "colonne": "pret",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "interpolation"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0023"
}
---

## Contexte

Toutes les copies portent `layer.stroke` (`scene.js:434-436`) ;
`RANGE_BOUNDS` ne connaît qu'opacité, échelle, rotation, épaisseur.
`interpolate.js:58` annonce déjà une variante `lerpColor`. Le dégradé de couleur
le long des copies est la variation générative la plus naturelle qui manque.

Une couleur n'est ni multiplicative ni additive : la règle de composition avec
une deuxième interpolation couleur est à fixer (la dernière l'emporte, ou
mélange).

## Critères d'acceptation

- [ ] Une interpolation « Couleur » avec deux couleurs, qui suit rampe, courbe et binding comme les autres.
- [ ] Composition de deux interpolations couleur définie et testée.
- [ ] Format bumpé, anciens fichiers relus à l'identique.
