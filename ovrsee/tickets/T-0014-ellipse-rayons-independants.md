---
{
  "id": "T-0014",
  "titre": "Ellipse : rayons indépendants",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "formes"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0012"
}
---

## Contexte

`SHAPES.circle` est marqué `uniform: true` : le glissement lui donne un rayon
unique, et le panneau n'offre qu'un champ « Rayon ». Les anneaux vus en
perspective de la planche — le tore incliné, les orbites — sont des ellipses,
donc hors d'atteinte aujourd'hui.

Le modèle stocke déjà `rx` et `ry` séparément ; seule la lecture du geste et le
panneau les confondent. Une ellipse n'est donc pas une forme de plus mais un
cercle qui cesse d'être uniforme.

## Critères d'acceptation

- [x] Une forme « Ellipse » se dessine au glisser avec deux demi-axes
      indépendants, et se règle par deux champs au panneau.
- [x] Le cercle reste disponible et uniforme : un glissement circulaire ne
      produit pas une ellipse presque ronde par accident.
- [ ] Combinée à la rotation de T-0013, une ellipse inclinée se rend et
      s'exporte correctement.
      *(en attente de T-0013 : pas encore de rotation propre)*
