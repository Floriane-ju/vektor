---
{
  "id": "T-0111",
  "titre": "Relever les plafonds de copies",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "modificateurs"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Le dessin plafonne trop tôt : rendu d'un calque suspendu au-delà de 2000
copies, curseur « Copies » d'un étage borné à 64.

## Critères d'acceptation

- [x] `MAX_COPIES` relevé à 10 000.
- [x] Curseur « Copies » jusqu'à 256.
