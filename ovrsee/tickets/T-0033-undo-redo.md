---
{
  "id": "T-0033",
  "titre": "Annuler / rétablir",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Rien n'annule. Supprimer un calque, effacer la pile d'interpolations par « Tout
retirer », ou écraser une forme d'un glissement malheureux sont des gestes
définitifs — et l'autosave écrit l'état fautif dans `localStorage` dans la
foulée.

Le modèle s'y prête sans chantier : chaque transition rend une nouvelle scène,
le store remplace une référence. Une pile de références suffit, il n'y a pas de
diff à calculer.

## Critères d'acceptation

- [x] `Cmd/Ctrl + Z` annule, `Cmd/Ctrl + Maj + Z` rétablit.
- [x] La pile couvre toutes les transitions de scène : calques, formes,
      modificateurs, interpolations.
- [x] Un glissement continu (dessin, slider) compte pour un seul pas, pas pour
      cinquante.
- [x] La profondeur de l'historique est bornée et la borne est nommée.
- [x] L'import d'un fichier JSON est annulable.
