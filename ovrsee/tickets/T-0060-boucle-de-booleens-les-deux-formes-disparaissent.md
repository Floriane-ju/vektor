---
{
  "id": "T-0060",
  "titre": "Boucle de booléens : les deux formes disparaissent",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "rendu",
    "persistance"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

Une forme utilisée comme outil n'est pas dessinée (`renderer-svg.js:34,40`). Le
sélecteur d'outil (`boolean-section.js:33`) propose toutes les autres formes,
`addBoolean` (`scene.js:628-637`) n'empêche pas les cycles, l'import non plus
(`persistence.js:281-288`). A outil de B et B outil de A → aucune des deux
n'est dessinée, sans message.

## Critères d'acceptation

- [x] Le sélecteur n'offre pas une forme qui créerait un cycle.
- [x] `addBoolean` renvoie la scène inchangée sur un cycle.
- [x] L'import refuse (ou retire) une chaîne cyclique, avec message.
