---
{
  "id": "T-0044",
  "titre": "Glisser horizontal sur les champs numériques",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

Régler une valeur numérique demande de taper ou de cliquer les flèches. Comme dans Figma, glisser horizontalement sur le champ doit faire varier la valeur.

## Critères d'acceptation

- [ ] Tout `input[type=number]` non focalisé affiche le curseur `ew-resize`.
- [ ] Glisser à droite augmente, à gauche diminue (par `step`, Maj ×10), borné par `min`/`max`.
- [ ] Un clic sans glisser focalise le champ pour la saisie.
- [ ] Un glissement complet = un seul pas d'annulation.
