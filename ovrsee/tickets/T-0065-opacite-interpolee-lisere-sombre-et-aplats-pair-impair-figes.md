---
{
  "id": "T-0065",
  "titre": "Opacité interpolée : liseré sombre et aplats pair-impair figés",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "rendu",
    "interpolation"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

`createNode` pose `fill-opacity` et `stroke-opacity` séparément
(`renderer-svg.js:387-388`). Sur une forme remplie, la moitié intérieure du trait
se peint sur l'aplat semi-transparent de même couleur : une rampe d'opacité
dessine un liseré plus foncé au bord de chaque copie. Le rendu booléen règle
déjà ce cas en posant `opacity` sur le groupe (`:428-430`).

En « Recoupements creux », l'aplat pair-impair n'a aucune opacité
(`ponytail:` de `:307-315`) : l'estompe disparaît des aplats.

## Critères d'acceptation

- [x] Forme remplie à opacité < 1 : pas de liseré plus foncé que l'aplat.
- [x] En recoupements creux, l'aplat suit la rampe d'opacité des copies.
