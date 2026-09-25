---
{
  "id": "T-0085",
  "titre": "Contour double (« outlined ») avec séparateur",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "rendu",
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Le trait d'une forme est un seul contour. On veut pouvoir le dédoubler : deux traits parallèles de l'épaisseur de la forme, séparés par un vide, l'ensemble centré sur le contour de base (comme une bordure creuse).

## Critères d'acceptation

- [ ] Case « Contour double » sur toutes les formes sauf le point.
- [ ] Cochée : un champ « Séparateur » règle l'écart vide entre les deux traits.
- [ ] Rendu : deux traits d'épaisseur `strokeWidth`, écart `gap`, centrés sur la géométrie ; le vide est transparent (aplat compris) ; l’écart suit l’échelle de la copie, l’épaisseur non.
- [ ] Vignette de l’arbre : contour double visible (traits fixes à l’écran, sans l’écart réel).
- [ ] Marche avec tirets et bouts de trait, et avec les booléens ; export SVG identique à l'écran.
- [ ] Sauvegarde : format bumpé, anciens fichiers lisibles, import borné.
