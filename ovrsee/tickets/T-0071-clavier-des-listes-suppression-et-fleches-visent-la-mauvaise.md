---
{
  "id": "T-0071",
  "titre": "Clavier des listes : suppression et flèches visent la mauvaise cible",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "s",
  "tags": [
    "ui",
    "accessibilite"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Le nom de calque ne gère que `Delete` (`layer-panel.js:133-138`) ; Retour arrière
remonte au raccourci global (`shortcuts.js:118-124`) qui supprime le calque
**actif**, pas celui qui a le focus. Idem dans la liste des formes
(`shape-list.js:155-160`).

`ARROW_OWNER` (`shortcuts.js:39`) n'inclut pas les boutons : ↑/↓ sur une ligne
de la liste déplacent la forme sur le plan au lieu de parcourir l'arbre.

## Critères d'acceptation

- [ ] Suppr et Retour arrière sur une ligne ayant le focus suppriment cette ligne-là.
- [ ] ↑/↓ sur une ligne de l'arbre déplacent le focus d'une ligne à l'autre ; le nudge ne joue que hors listes.
- [ ] Test app sur les deux comportements.
