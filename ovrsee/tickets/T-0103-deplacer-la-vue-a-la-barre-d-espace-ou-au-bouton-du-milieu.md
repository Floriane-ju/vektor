---
{
  "id": "T-0103",
  "titre": "Déplacer la vue à la barre d'espace ou au bouton du milieu",
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

La vue ne se déplace qu'à la molette (`zoom.js:18-21`, `ponytail:` assumé). Avec
une souris classique, le défilement horizontal passe par Maj+molette, peu connu ;
aucun geste « main » comme dans les autres éditeurs vectoriels.

## Critères d'acceptation

- [ ] Espace maintenu : curseur `grab`, glisser déplace la vue sans toucher à la
      scène (pas de pas d'historique) ; relâcher rend l'outil précédent.
- [ ] Glisser au bouton du milieu fait de même.
- [ ] Espace dans un champ de saisie tape un espace (pas de capture).
- [ ] Geste listé dans l'aide des raccourcis.
