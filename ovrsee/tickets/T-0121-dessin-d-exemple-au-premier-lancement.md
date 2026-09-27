---
{
  "id": "T-0121",
  "titre": "Dessin d'exemple au premier lancement",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null,
  "epic": null
}
---

## Contexte

Sans sauvegarde locale, l'appli s'ouvre sur un plan vide. Un dessin d'exemple
(fourni : `vektor.json`) montre d'emblée ce que l'outil sait faire.

## Critères d'acceptation

- [x] Aucune sauvegarde locale : la scène de départ est le dessin d'exemple.
- [x] Sauvegarde illisible : pas d'exemple (projet vierge + message, inchangé).
- [x] Une scène vidée par l'utilisateur reste vide au rechargement.
