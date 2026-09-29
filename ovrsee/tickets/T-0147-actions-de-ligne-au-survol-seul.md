---
{
  "id": "T-0147",
  "titre": "Actions de ligne au survol seul",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui"],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": null
}
---

## Contexte

Les actions des lignes de l'arbre (calques, formes) restaient visibles sur la ligne active et après un clic (focus). Demande : n'apparaître qu'au survol, pas du seul fait d'être sélectionnée.

## Critères d'acceptation

- [x] Actions visibles au survol de la ligne ; cachées sur une ligne sélectionnée non survolée, y compris juste après un clic.
- [x] Clavier : visibles quand le focus (visible) est dans la ligne.
