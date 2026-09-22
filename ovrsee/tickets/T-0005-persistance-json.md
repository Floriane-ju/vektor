---
{
  "id": "T-0005",
  "titre": "Persistance JSON : autosave, export, import validé",
  "colonne": "revue",
  "priorite": "moyenne",
  "charge": "s",
  "tags": ["data"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

Un JSON importé est une donnée externe : il se valide avant d'entrer dans le
store. Un fichier malformé doit produire un message d'erreur visible, pas un
scene graph à moitié construit qui casse le renderer plus loin.

## Critères d'acceptation

- [ ] Exporter en JSON puis réimporter reconstruit un scene graph identique :
      mêmes calques, modificateurs, valeurs de `n` et plages d'interpolation.
- [ ] L'autosave `localStorage` restaure la scène au rechargement de la page.
- [ ] Un JSON malformé ou de forme inattendue est rejeté avec un message
      visible ; la scène courante reste intacte.
- [ ] Un `n` hors bornes dans le fichier importé est clampé, pas propagé tel
      quel.
