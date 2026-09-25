---
{
  "id": "T-0112",
  "titre": "Export PNG à taille fixe et copie PNG",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "export"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Les exports PNG 1×/2×/4× suivent la taille du dessin : un grand dessin donne
une image démesurée, et aucun format carré prêt à publier.

## Critères d'acceptation

- [x] PNG 1×/2×/4× retirés du menu.
- [x] « Exporter en PNG » : plus grand côté = 1920 px quel que soit le dessin.
- [x] « Exporter en PNG (1080 × 1080) » : dessin centré, ajusté au carré.
- [x] « Copier en PNG (1080 × 1080) » : même image dans le presse-papier.
