---
{
  "id": "T-0012",
  "titre": "Géométrie des formes",
  "colonne": "backlog",
  "priorite": "haute",
  "tags": ["epic","formes"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "type": "epic"
}
---

## Contexte

Le stock de formes — cercle, point, rectangle, ligne — ne couvre qu'un tiers de
la planche de référence. Il y manque trois familles qui y reviennent sans
cesse : les polygones (hexagones, octogones, triangles), les arcs et secteurs
(demi-disques, cibles, croissants), et les formes orientées autrement qu'à
l'horizontale.

Cet epic regroupe ce qui s'ajoute au vocabulaire de dessin. Il précède les
autres : un modificateur ne peut pas orienter une forme qui n'a pas d'angle,
et une interpolation ne peut pas faire courir une propriété qui n'existe pas.

## Critères d'acceptation

- [ ] Les éléments de la planche de référence se décomposent tous en formes
      disponibles, sans recourir à un import externe.
- [ ] Chaque nouvelle forme se dessine au glisser, se règle au panneau, se
      sérialise et se relit.
