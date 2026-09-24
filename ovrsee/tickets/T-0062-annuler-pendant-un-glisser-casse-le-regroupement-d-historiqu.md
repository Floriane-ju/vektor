---
{
  "id": "T-0062",
  "titre": "Annuler pendant un glisser casse le regroupement d'historique",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "xs",
  "tags": [
    "historique"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

`travel` (`store.js:47`) remet `gesture = null`. Si on fait ⌘Z au milieu d'un
glissement, chaque mouvement suivant du même geste devient un pas d'historique
et vide `future` : dizaines de pas parasites, rétablir perdu.

## Critères d'acceptation

- [x] Après ⌘Z en plein geste, la suite du geste compte pour un seul pas.
- [x] Test dans le store : begin → apply → undo → apply ×3 → end ⇒ un seul pas ajouté.
