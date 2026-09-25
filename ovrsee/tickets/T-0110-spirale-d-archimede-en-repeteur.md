---
{
  "id": "T-0110",
  "titre": "Spirale d'Archimède en répéteur",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "modificateurs"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

La spirale existante est logarithmique (facteur constant par copie). On veut
aussi une spirale d'Archimède : rayon qui croît linéairement avec l'angle,
spires équidistantes. Mêmes réglages que la spirale : copies, pas angulaire,
croissance, espacement constant, orientation, pivot, liaison linéaire.

## Critères d'acceptation

- [x] Type « Spirale d'Archimède » dans les modificateurs, mêmes champs que la spirale.
- [x] Facteur `1 + i·r` à pas angulaire constant (rayon linéaire en angle).
- [x] « Espacement constant » : même courbe, copies à longueur d'arc égale.
- [x] Sauvegarde/relecture, format bumpé, anciens fichiers lisibles.
