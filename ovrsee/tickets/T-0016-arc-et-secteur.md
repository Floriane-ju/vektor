---
{
  "id": "T-0016",
  "titre": "Arc et secteur de cercle",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "formes"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0012"
}
---

## Contexte

Demi-disques pleins, cibles à quartiers, croissants, arcs de cadran : la
planche s'appuie massivement sur le cercle partiel. Le cercle actuel est
toujours entier, donc aucun de ces éléments n'est atteignable.

Un arc se décrit par un angle de début et un angle de fin. Sa fermeture décide
de ce qu'on voit : l'arc nu, la corde, ou le secteur plein qui revient au
centre — trois lectures d'une même paire d'angles, donc un seul réglage.

## Critères d'acceptation

- [ ] Forme « Arc » : rayon, angle de début, angle de fin, mode de fermeture
      (ouvert / corde / secteur).
- [ ] Un secteur rempli se peint de la couleur du calque, comme les autres
      formes remplies.
- [ ] Un arc de 0 à 360° rend un cercle complet sans artefact de raccord.
- [ ] Le geste de dessin pose un arc utilisable sans passer par le panneau.
