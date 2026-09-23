---
{
  "id": "T-0024",
  "titre": "Propriétés interpolables : rotation et épaisseur",
  "colonne": "pret",
  "priorite": "haute",
  "tags": [
    "interpolation"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0023"
}
---

## Contexte

`RANGE_BOUNDS` ne contient qu'`opacity` et `scale`. Deux dégradés courants de
la planche manquent donc à l'appel : les motifs vrillés, où chaque copie tourne
un peu plus que la précédente, et les traits qui s'affinent d'un bord à
l'autre.

`stackValues` est générique sur le nom de propriété et se compose par produit.
L'épaisseur s'y prête directement ; la rotation est additive et non
multiplicative — c'est le seul point à trancher dans l'implémentation, pas dans
le ticket.

## Critères d'acceptation

- [ ] `rotation` et `strokeWidth` figurent parmi les propriétés interpolables,
      avec des bornes et une valeur neutre propres.
- [ ] Une interpolation de rotation de 0 à 180° sur 10 copies produit un motif
      vrillé régulier.
- [ ] Une interpolation d'épaisseur de 4 à 0,5 affine visiblement les copies.
- [ ] Deux interpolations de rotation empilées se composent sans sauter.
- [ ] Une scène enregistrée avant ce ticket se relit sans erreur.
