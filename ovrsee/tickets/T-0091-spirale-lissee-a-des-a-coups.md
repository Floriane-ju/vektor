---
{
  "id": "T-0091",
  "titre": "Spirale lissée à des à-coups",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "rendu",
    "bug"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Répétition linéaire lissée d'un point le long d'une spirale : la courbe n'est
pas régulière, elle ondule entre les copies. Le lissage Catmull-Rom ne fait
qu'approcher la trajectoire ; avec des pas angulaires larges l'écart atteint
quelques % du rayon, visible sur une grande spirale.

## Critères d'acceptation

- [ ] Lissé, le tracé d'un étage spirale/axial/pas suit exactement la
      transformation de l'étage entre deux copies (indice fractionnaire).
- [ ] Un cercle axial lissé reste à rayon constant (écart < 1e-6).
- [ ] Les tests existants du lissage passent.
