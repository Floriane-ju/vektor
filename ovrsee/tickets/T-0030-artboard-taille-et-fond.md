---
{
  "id": "T-0030",
  "titre": "Plan de travail : taille et fond",
  "colonne": "backlog",
  "priorite": "moyenne",
  "tags": ["rendu","export"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

`STAGE` est une constante à 900 × 900, et le SVG exporté n'a pas de fond. Or
les illustrations visées vivent sur un aplat sombre : l'ouvrir dans un
visualiseur à fond blanc donne un trait clair invisible, et aucun format autre
que le carré n'est atteignable.

## Critères d'acceptation

- [ ] La taille du plan de travail se règle (largeur, hauteur) et la scène s'y
      adapte sans déplacer les formes existantes.
- [ ] Une couleur de fond de scène se règle, s'affiche à l'écran et sort dans
      le SVG exporté.
- [ ] Un fond transparent reste possible et reste le comportement par défaut
      pour les projets existants.
- [ ] Taille et fond sont enregistrés dans le JSON et restaurés à l'import.
