---
{
  "id": "T-0153",
  "titre": "Profil du contour double (uniforme, fin / large / fin)",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["rendu", "ui"],
  "cree": "2026-11-11",
  "maj": "2026-11-11",
  "plan": null
}
---

## Contexte

Le contour double garde un écart constant. On veut choisir sa « forme » le long
du tracé, comme les profils de contour d'un logiciel d'illustration. Pour
commencer : uniforme et fin / large / fin (fuseau).

Choix : seul l'**écart** varie (les deux traits gardent leur épaisseur, ils se
touchent aux bouts), sur les **formes ouvertes** seulement (ligne, arc ouvert,
tracé ouvert, point relié), en 2D et dans un calque 3D.

## Critères d'acceptation

- [ ] Réglage « Profil » sous « Contour double » : Uniforme / Fuseau.
- [ ] Fuseau : écart nul aux bouts, plein au milieu, le long de la longueur du tracé.
- [ ] Même rendu dans un calque 3D (bande extrudée, lignes cachées).
- [ ] Sans effet sur une forme fermée.
- [ ] Format bumpé, anciens fichiers lisibles, import validé.
