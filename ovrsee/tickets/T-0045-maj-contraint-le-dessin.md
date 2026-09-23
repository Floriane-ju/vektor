---
{
  "id": "T-0045",
  "titre": "Maj contraint le dessin (carré, cercle, 45°)",
  "colonne": "revue",
  "priorite": "moyenne",
  "tags": ["ui", "dessin"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

Comme dans les logiciels de dessin, maintenir Maj pendant le glisser doit « équilibrer » la forme.

## Critères d'acceptation

- [x] Ellipse → cercle, rectangle → carré (demi-extensions égales à la plus grande).
- [x] Ligne → angle aimanté par pas de 45°, longueur conservée.
- [x] Formes déjà uniformes (cercle, arc, polygone, point) inchangées.
- [x] Outil Cercle retiré (touche C libérée), l'ellipse devient l'outil par défaut ; type `circle` supprimé du modèle (aucune conversion : pas encore d'utilisateurs).
- [x] Maj pressée ou relâchée en cours de geste prend effet au mouvement suivant.
