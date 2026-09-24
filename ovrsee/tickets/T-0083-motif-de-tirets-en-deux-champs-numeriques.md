---
{
  "id": "T-0083",
  "titre": "Motif de tirets en deux champs numériques",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

Le champ texte « Motif libre (× épaisseur) » demande de taper une liste de nombres. En mode tiret, deux valeurs suffisent : longueur du tiret et de l'espace.

## Critères d'acceptation

- [ ] En mode « Tirets », deux champs `number` (Tiret, Espace) remplacent le champ texte.
- [ ] Ils sont masqués en mode Plein et Points.
- [ ] Modifier l'un garde l'autre, valeurs bornées par `clampDash`.
