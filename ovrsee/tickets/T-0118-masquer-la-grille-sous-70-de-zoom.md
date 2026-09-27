---
{
  "id": "T-0118",
  "titre": "Masquer la grille sous 70 % de zoom",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui", "perf"],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null
}
---

## Contexte

Dézoomée, la grille devient trop dense : dessin lourd, tout rame.

## Critères d'acceptation

- [x] Sous 70 % de zoom, la grille n'est plus dessinée.
- [x] Le réglage « Grille » reste coché et l'aimantation continue d'agir.
- [x] Revenir à 70 % ou plus la réaffiche.
