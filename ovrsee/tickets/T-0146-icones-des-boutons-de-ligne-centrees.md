---
{
  "id": "T-0146",
  "titre": "Icônes des boutons de ligne centrées",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": null
}
---

## Contexte

Les boutons d'action des lignes de l'arbre (3D, œil, cadenas, dupliquer, supprimer) sont des `.icon-btn` en `display: block` : l'icône `inline-flex` s'y pose sur la ligne de base et remonte de 1,7 px par rapport au centre du bouton. Les autres porteurs d'icône (pilules, chevrons, lignes) sont déjà en flex centré.

## Critères d'acceptation

- [ ] Toute `.icon` a son centre au centre de son conteneur (écart < 0,3 px), mesuré dans le navigateur.
