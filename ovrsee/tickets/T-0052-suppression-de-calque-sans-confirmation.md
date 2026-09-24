---
{
  "id": "T-0052",
  "titre": "Suppression de calque sans « Sûr ? », au clavier comme une forme",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

Supprimer un calque demande une confirmation « Sûr ? ». L'historique (⌘Z)
couvre déjà l'erreur : la confirmation est de trop. Et Suppr ne vise que la
forme sélectionnée, pas le calque.

## Critères d'acceptation

- [x] « × » supprime le calque directement, sans étape « Sûr ? ».
- [x] Suppr / Retour arrière supprime le calque actif quand aucune forme n'est
      sélectionnée.
- [x] La liste des raccourcis le mentionne.
