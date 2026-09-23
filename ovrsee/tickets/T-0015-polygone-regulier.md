---
{
  "id": "T-0015",
  "titre": "Polygone régulier",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "formes"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0012"
}
---

## Contexte

Hexagones, octogones, triangles, décagones, étoiles : la planche de référence
en compte une douzaine. Aucun n'est constructible aujourd'hui autrement qu'en
posant des lignes une à une, ce qui ne survit ni au redimensionnement ni aux
modificateurs.

Un polygone régulier se paramètre par un nombre de côtés et un rayon — la même
famille couvre l'étoile si un second rayon, celui des sommets creux, est
admis.

## Critères d'acceptation

- [x] Forme « Polygone » : nombre de côtés (≥ 3), rayon, se dessine au glisser.
- [x] Un champ « Rayon intérieur » optionnel produit une étoile ; à sa valeur
      neutre, le polygone reste convexe.
- [x] Le polygone se rend en `<polygon>` et non en lignes séparées.
- [ ] Il suit la rotation de T-0013 et l'échelle des interpolations.
      *(en attente de T-0013 : pas encore de rotation propre)*
