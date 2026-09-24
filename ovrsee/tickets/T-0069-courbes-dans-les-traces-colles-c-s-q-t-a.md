---
{
  "id": "T-0069",
  "titre": "Courbes dans les tracés collés (C, S, Q, T, A)",
  "colonne": "pret",
  "priorite": "basse",
  "charge": "m",
  "tags": [
    "formes"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0012"
}
---

## Contexte

`path.js` n'accepte que M/L/H/V/Z (`ponytail:` l. 9-11). Un attribut `d` copié
depuis Illustrator, Figma ou Inkscape contient presque toujours des courbes et
se voit refusé.

## Critères d'acceptation

- [ ] Les commandes C, S, Q, T, A (absolues et relatives) sont échantillonnées en sommets.
- [ ] Le nombre de sommets produits reste sous `MAX_POINTS` (cf. T-0059).
- [ ] Test : un cercle en deux arcs `A` donne une polyligne fermée proche du cercle.
