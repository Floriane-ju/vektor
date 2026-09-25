---
{
  "id": "T-0107",
  "titre": "3D : découpe des parois quadratique sur les rubans répétés",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "perf",
    "rendu"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

`wallNeighbours` (`renderer-plane.js:98-114`) met dans un seul groupe tous les
volumes d'un calque de même extrusion, et donne à chacun la liste de tous les
autres. `flankRuns` (`:253`) teste ensuite chaque sommet contre toutes les
arêtes de ces voisins. Un ruban de spirale lissée de k sommets répété n fois en
axial coûte ~(n·k)² tests : c'est précisément le motif visé par T-0095.

## Critères d'acceptation

- [x] Banc reproductible d'abord (test ou script) : spirale lissée en ruban 3D ×
      axial 12, temps de `render` mesuré avant tout changement.
- [x] Voisins filtrés par boîte englobante à l'écran (ou index spatial) avant le
      test fin : une paroi qui ne recouvre pas la boîte d'un sommet n'est pas testée.
- [x] Rendu identique sur les tests 3D existants ; temps du banc au moins divisé par 3.
