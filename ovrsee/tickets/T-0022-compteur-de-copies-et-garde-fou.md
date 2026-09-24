---
{
  "id": "T-0022",
  "titre": "Compteur de copies et garde-fou",
  "colonne": "revue",
  "priorite": "basse",
  "tags": [
    "modificateurs",
    "perf"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0018"
}
---

## Contexte

Empiler multiplie : trois modificateurs à 12 copies font 1728 copies du calque,
chacune répétant toutes ses formes. Rien n'affiche ce total, et rien ne
l'arrête — un `n` saisi à 200 sur un étage intermédiaire fige l'onglet, et
l'utilisateur n'a pas vu venir la marche.

Le total se lit déjà dans `stackCopies` ; il ne manque que de l'afficher, et de
refuser poliment au-delà d'un seuil plutôt que de rendre.

## Critères d'acceptation

- [ ] Le nombre de copies produites par la pile s'affiche dans la section
      Modificateurs, et se met à jour à chaque réglage.
- [ ] Au-delà d'un plafond, le rendu est suspendu avec un message explicite
      plutôt que tenté.
- [ ] Le plafond est une constante nommée, pas un nombre dispersé dans le code.
