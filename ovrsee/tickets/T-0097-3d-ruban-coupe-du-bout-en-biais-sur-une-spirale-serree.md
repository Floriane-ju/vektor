---
{
  "id": "T-0097",
  "titre": "3D : ruban — coupe du bout en biais sur une spirale serrée",
  "colonne": "en-cours",
  "priorite": "haute",
  "tags": ["3d", "rendu"],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Point relié en spirale, contour double, sur un plan 3D : au bout serré de la
spirale, le bord intérieur rebrousse et `untangle` le ramène au sommet qui
suit, plus loin le long du tracé. La coupe du bout (face du haut) part en
biais et ne rejoint plus l'arête qui descend : pointe en flèche.

## Critères d'acceptation

- [ ] Les deux bords d'un contour double ouvert finissent sur la même droite
      en travers du tracé, même quand le bord intérieur rebrousse.
- [ ] Test qui échoue sans le correctif.
