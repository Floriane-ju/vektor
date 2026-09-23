---
{
  "id": "T-0017",
  "titre": "Tracé polyligne libre",
  "colonne": "revue",
  "priorite": "basse",
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

Le triangle de Penrose, les pyramides en fil de fer, le labyrinthe : ces
éléments de la planche sont des tracés à sommets libres, qu'aucune forme
paramétrique ne reproduit.

C'est le seul ajout du lot qui change la nature du modèle : les autres formes
tiennent dans `x, y, rx, ry`, une polyligne porte une liste de points. La
question ouverte est celle de l'édition — poser les sommets au clic puis les
déplacer demande un mode d'outil que le reste de l'interface n'a pas.

## Critères d'acceptation

- [x] **Tranché** : import d'un chemin SVG collé (segments droits : M, L, H,
      V, Z), puis tracé au clic et sommets déplaçables au canvas.
- [x] Une fois le mode d'édition tranché : une polyligne fermée ou ouverte se
      dessine, se déplace comme un tout, et suit les modificateurs.
