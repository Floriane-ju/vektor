---
{
  "id": "T-0036",
  "titre": "Bibliothèque de préréglages de calque",
  "colonne": "backlog",
  "priorite": "basse",
  "tags": [
    "ui",
    "persistance"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Un calque réussi — la bonne pile de modificateurs, la bonne rampe — ne se
rejoue que dans le projet où il a été construit. La planche de référence est
justement un catalogue : cinquante motifs qu'on veut pouvoir reprendre et
décliner d'un projet à l'autre.

La sérialisation d'un calque existe déjà dans `persistence.js`. Ce qui manque
est l'endroit où les ranger et la manière de les retrouver — question ouverte.

## Critères d'acceptation

- [ ] **À trancher** : préréglages en `localStorage`, ou fichiers `.json`
      importés à la demande, ou les deux.
- [ ] **À trancher** : une vignette par préréglage suppose de rendre un aperçu
      hors écran — utile, mais c'est le gros du travail.
- [ ] Une fois tranché : enregistrer le calque actif comme préréglage, puis
      l'insérer dans un autre projet, redonne le même rendu.
