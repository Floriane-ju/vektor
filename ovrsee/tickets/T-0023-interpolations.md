---
{
  "id": "T-0023",
  "titre": "Interpolations",
  "colonne": "backlog",
  "priorite": "moyenne",
  "tags": ["epic","interpolation"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "type": "epic"
}
---

## Contexte

La pile d'interpolations ne fait courir que deux propriétés — opacité et
échelle — et toujours le long d'une rampe linéaire. Les dégradés de la planche
de référence sont souvent autre chose : une épaisseur qui s'affine, une
rotation qui s'accumule, un aller-retour qui revient à son point de départ.

Le moteur est déjà générique sur le nom de la propriété : chaque ajout est une
entrée dans `RANGE_BOUNDS`, pas un chantier.

## Critères d'acceptation

- [ ] Les dégradés visibles sur la planche se reproduisent sans retoucher les
      copies une à une.
