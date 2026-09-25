---
{
  "id": "T-0099",
  "titre": "Interpoler la géométrie : étirement rx/ry et décalage des tirets",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "interpolation"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0023"
}
---

## Contexte

`RANGE_BOUNDS` (`scene.js:41-53`) ne fait courir qu'opacité, échelle, rotation,
épaisseur et couleur. L'échelle est uniforme : impossible d'aplatir
progressivement une ellipse ou un rectangle le long des copies (anneaux qui
deviennent des ellipses, barres qui s'affinent). Les tirets ne peuvent pas
« défiler » d'une copie à l'autre, effet fréquent sur la planche de référence.

## Critères d'acceptation

- [x] Propriétés interpolables `scaleX`/`scaleY` (facteurs de `rx`/`ry`, neutre 1,
      composées par produit comme `scale`) — sans effet sur le point.
- [x] Propriété `dashOffset` (additive, en multiples de l'épaisseur comme le motif
      de tirets) ; sans effet sur un trait plein.
- [x] Test : rampe `scaleY` 1 → 0,2 sur 5 copies → `ry` rendu décroissant ;
      sérialisé puis relu à l'identique ; `FORMAT` bumpé si la lecture l'exige.
