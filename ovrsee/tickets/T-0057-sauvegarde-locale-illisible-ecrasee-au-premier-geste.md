---
{
  "id": "T-0057",
  "titre": "Sauvegarde locale illisible écrasée au premier geste",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "s",
  "tags": [
    "persistance"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

Quand `loadLocal` échoue (`main.js:25-35`), l'appli démarre sur un projet vierge
avec « Sauvegarde locale illisible, projet vierge », puis l'autosave
(`store.subscribe(debounce(saveLocal))`) écrit sur la même `STORAGE_KEY` au
premier geste. Le contenu illisible — souvent parfaitement récupérable, par
exemple un format plus récent ouvert dans un onglet ancien — est perdu.

## Critères d'acceptation

- [ ] Une sauvegarde illisible est copiée sur une clé de secours avant toute écriture de l'autosave.
- [ ] Le message de démarrage le dit et permet de récupérer ce contenu (export du JSON brut).
- [ ] Test : `loadLocal` en échec puis un geste → la clé de secours contient l'ancien texte intact.
