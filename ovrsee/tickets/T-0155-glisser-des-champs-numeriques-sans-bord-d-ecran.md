---
{
  "id": "T-0155",
  "titre": "Glisser des champs numériques sans bord d'écran",
  "colonne": "revue",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-11-11",
  "maj": "2026-11-11",
  "plan": null
}
---

## Contexte

Le glisser horizontal sur un champ numérique s'arrête au bord de l'écran : la valeur ne peut plus monter ni descendre.

## Critères d'acceptation

- [ ] Pendant le glisser, le curseur qui touche un bord réapparaît au bord opposé et la valeur continue de varier (Chromium et Firefox).
- [ ] Échap pendant le glisser rend le vrai curseur sans saut de valeur.
- [ ] Verrou du pointeur refusé : le glisser marche comme avant, borné par l'écran.
