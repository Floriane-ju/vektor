---
{
  "id": "T-0056",
  "titre": "Robustesse des données",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "l",
  "tags": [
    "epic",
    "persistance"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "type": "epic"
}
---

## Contexte

Le tour de code du 24 sept. a relevé plusieurs chemins où le travail se perd
ou s'altère sans que rien ne le signale : une sauvegarde locale illisible est
écrasée, l'autosave échoue en silence, un tracé collé trop long rend le fichier
illisible, une boucle de booléens efface deux formes, une saisie hors bornes
change de valeur au rechargement.

Cet epic regroupe ces trous. Chacun est petit ; ensemble, ils font qu'on ne peut
pas encore faire confiance à l'outil pour garder un dessin.

## Critères d'acceptation

- [ ] Aucun geste ni fichier ne fait perdre ou altérer le travail sans message.
- [ ] Ce qui s'affiche avant un rechargement est ce qui s'affiche après.
