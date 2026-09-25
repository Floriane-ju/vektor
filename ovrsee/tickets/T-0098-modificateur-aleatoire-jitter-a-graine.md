---
{
  "id": "T-0098",
  "titre": "Modificateur aléatoire (jitter) à graine",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "modificateurs"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0018"
}
---

## Contexte

Toute répétition est déterministe (`MODIFIERS` = pas, miroirs, axial, spirale,
`modifiers.js:129`) : aucune trace de `seed` ni de `random` dans `src/`. Les
motifs « Retro Futuristic » vivent souvent d'une régularité légèrement cassée
(copies décalées, tournées, ou d'échelle irrégulière). Un décalage, une rotation
ou une échelle par copie restent des similitudes : le moteur le supporte.

## Critères d'acceptation

- [x] **Tranché** : courbe d'interpolation « Aléatoire » (bruit à la place de la
      rampe `t(i, n)`), pas d'étage de pile.
- [x] **Tranché** : toutes les propriétés interpolables (rotation, échelle,
      étirement, opacité, couleur…), graine par interpolation. Position x/y
      non couverte.
- [x] Une fois tranché : même graine = même dessin, avant et après rechargement ;
      bouton « relancer » qui tire une autre graine (un pas d'historique).
- [x] Changement de modèle : `FORMAT` bumpé, anciens fichiers relus.
