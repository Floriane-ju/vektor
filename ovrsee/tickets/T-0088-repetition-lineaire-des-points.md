---
{
  "id": "T-0088",
  "titre": "Répétition linéaire des points",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["modificateurs", "rendu"],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Un point dupliqué par la pile de modificateurs donne des points isolés. On veut
pouvoir relier les copies successives par des segments, pour dessiner des
lignes, rayons, polygones et spirales à partir d'un seul point.

## Critères d'acceptation

- [x] Option « Répétition linéaire » sur un point : au lieu de deux points, une ligne qui les relie, pour tous les types de modificateur.
- [x] Case « Activer les répétitions linéaires » sur chaque modificateur (éteinte par défaut) ; décochée, l'étage ignore l'option du point.
- [x] Sauvegarde : format bumpé, anciens fichiers relus option éteinte.
