---
{
  "id": "T-0080",
  "titre": "Couleur des formes dans l'arbre, sélection de forme en orange",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

La couleur vit sur la forme depuis `@20` : la pastille du calque (couleur de
sa dernière forme) n'a plus de sens. Chaque icône de forme dans l'arbre prend
sa propre couleur. La sélection d'une forme passe du bleu (`--select`) à
l'accent orange de l'app.

## Critères d'acceptation

- [x] Plus de pastille (`.layer-swatch`) sur la ligne du calque.
- [x] L'aperçu de chaque forme de l'arbre dessine sa géométrie réelle (ratio, rotation), dans sa couleur, plein si remplie, blanc sur la ligne sélectionnée ; mis à jour en continu.
- [x] Forme sélectionnée (ligne de l'arbre, cadre et poignées sur le plan) en `--accent`.
- [x] `pnpm test` passe.
