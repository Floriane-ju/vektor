---
{
  "id": "T-0149",
  "titre": "Espacements des champs nombre et menus",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["ui", "design-system"],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": null
}
---

## Contexte

La valeur d'un curseur (ex. « Copies 6 ») est alignée à droite et collée aux flèches du champ nombre ; le chevron natif des `select` touche presque le bord du champ, la marge intérieure n'y change rien.

## Critères d'acceptation

- [ ] Valeur des champs nombre alignée à gauche, espace entre le texte et les flèches (Chromium ; Firefox sans régression).
- [ ] Chevron des `select` = icône Material `expand_more`, à `--space-5` du bord droit, dans Chromium et Firefox.
- [ ] `pnpm test` passe.
