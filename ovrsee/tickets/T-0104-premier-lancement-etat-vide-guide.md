---
{
  "id": "T-0104",
  "titre": "Premier lancement : état vide guidé",
  "colonne": "backlog",
  "priorite": "basse",
  "charge": "s",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Sans sauvegarde locale, l'appli s'ouvre sur un plan vide et un arbre vide
(`main.js`). Rien n'indique qu'on dessine directement au glisser (un calque est
créé tout seul, T-0053), ni que `?` ouvre l'aide des raccourcis.

## Critères d'acceptation

- [ ] Scène sans calque : message discret au centre du plan (« Choisis une forme
      et glisse sur le plan · ? pour les raccourcis »), retiré au premier dessin,
      absent de l'export.
- [ ] Arbre vide : même invitation dans le panneau de gauche.
