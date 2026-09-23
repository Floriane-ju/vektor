---
{
  "id": "T-0032",
  "titre": "Flux de travail",
  "colonne": "backlog",
  "priorite": "haute",
  "tags": ["epic","ui"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "type": "epic"
}
---

## Contexte

L'outil sait composer, mais pas encore accompagner la composition : aucune
annulation, aucune duplication, presque aucun raccourci. Or ce genre
d'illustration se trouve par essais successifs — on pousse un réglage, on
regarde, on revient.

Un geste perdu coûte ici plus cher qu'ailleurs : une pile de modificateurs
supprimée par erreur emporte ses liaisons d'interpolation, et rien ne les
ramène.

## Critères d'acceptation

- [ ] Explorer un réglage puis revenir en arrière ne coûte aucune perte.
- [ ] Reproduire une variante d'un calque existant ne demande pas de le
      reconstruire.
