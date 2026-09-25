---
{
  "id": "T-0086",
  "titre": "Plan 3D isométrique des calques et hauteur Z des formes",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "l",
  "tags": [
    "rendu",
    "modele",
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": "2026-09-25-plan-3d-isometrique-des-calques-hauteur-z-des-formes-format.md"
}
---

## Contexte

Reproduire l'effet des illustrations « Retro Futuristic » : anneaux vus en
perspective parallèle, extrudés, arêtes cachées masquées. Le calque porte un
plan incliné (après la pile de modificateurs), chaque forme une hauteur Z.

## Critères d'acceptation

- [ ] Réglages du calque : « Plan 3D » activable, inclinaison (0–89°), orientation (0–360°), flancs transparents ou colorés.
- [ ] Réglages de la forme : « Hauteur Z » signée, visible quand le calque a un plan.
- [ ] Une ellipse extrudée montre face avant, arêtes de silhouette et moitié visible de la face arrière ; le reste est masqué.
- [ ] Un point extrudé se dessine en segment (axe).
- [ ] Le trait garde son épaisseur (pas écrasé par la projection).
- [ ] Dessiner / déplacer au pointeur sur un calque incliné suit le curseur.
- [ ] Format `vektor/scene@23` ; fichiers `@22` et antérieurs relus sans plan ni hauteur.
- [ ] `pnpm test` vert.
