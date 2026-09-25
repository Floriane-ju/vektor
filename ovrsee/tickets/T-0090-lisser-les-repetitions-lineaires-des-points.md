---
{
  "id": "T-0090",
  "titre": "Lisser les répétitions linéaires des points",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["rendu", "modificateurs"],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Un point relié le long d'un étage donne une ligne brisée entre ses copies. On
veut une option « Lisser » qui fait passer une courbe douce par les copies
(ex. axial → arc de cercle), les copies servant de points de contrôle.

## Critères d'acceptation

- [ ] Case « Lisser » sur un étage de point dont la répétition linéaire est active.
- [ ] Cochée, le tracé passe par toutes les copies en courbe (Catmull-Rom), fermé si l'axial se referme.
- [ ] Marche en 3D, contour double, tirets (le tracé reste une polyline échantillonnée).
- [ ] Format bumpé, anciens fichiers lisibles ; un fichier `@24` garde l'orientation des copies.
