---
{
  "id": "T-0025",
  "titre": "Courbe de rampe des interpolations",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "interpolation"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0023"
}
---

## Contexte

`t(i, n) = i / (n - 1)` est linéaire, et c'est la seule rampe disponible. Or
beaucoup de motifs de la planche ne sont pas linéaires : les halos qui
s'estompent vite puis lentement, les couronnes dont l'opacité repart en sens
inverse à mi-course, les répétitions dont un rang sur deux est marqué.

La rampe est déjà isolée dans `interpolate.js` et partagée par tout le reste :
une courbe s'y branche à un seul endroit.

## Critères d'acceptation

- [ ] Une interpolation porte une courbe : linéaire, entrée douce, sortie
      douce, aller-retour, alternance.
- [ ] Le réglage est par interpolation, pas par calque.
- [ ] La courbe par défaut reste linéaire — les scènes existantes ne bougent
      pas.
- [ ] Les valeurs de la rampe sont couvertes par un test, comme la rampe
      linéaire l'est déjà.
