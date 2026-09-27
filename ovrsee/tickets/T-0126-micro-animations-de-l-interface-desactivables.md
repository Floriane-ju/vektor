---
{
  "id": "T-0126",
  "titre": "Micro-animations de l'interface, désactivables",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "ui",
    "accessibilite"
  ],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": "2026-09-27-micro-animations-de-l-interface-desactivables-rgaa-13-8.md"
}
---

## Contexte

Les listes (onglets, calques, formes) sont reconstruites à chaque changement : une ligne ajoutée surgit sans transition. Des animations courtes doivent montrer où les choses arrivent, et rester coupables (RGAA 13.8).

## Critères d'acceptation

- [ ] Nouveau dessin, calque ou forme : la ligne apparue s'anime, les autres non ; changer de calque ou de dessin n'anime rien.
- [ ] Popovers, statut et boutons pressés ont un retour de mouvement bref (≤ 300 ms).
- [ ] Case « Animations » dans Paramètres, mémorisée ; décochée, aucune animation ni transition.
- [ ] Sans choix, `prefers-reduced-motion: reduce` coupe les animations.
