---
{
  "id": "T-0034",
  "titre": "Dupliquer un calque ou une forme",
  "colonne": "backlog",
  "priorite": "haute",
  "tags": ["ui"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Aucune duplication. Décliner un motif — la même couronne, deux fois plus
grande, tournée de 30° — demande de reconstruire la pile de modificateurs et
d'interpolations à l'identique, réglage par réglage. C'est le geste le plus
fréquent de ce type de composition, et c'est celui qui manque.

Une copie de calque doit emporter sa pile complète, et renuméroter ses
identifiants pour ne pas entrer en collision avec l'original.

## Critères d'acceptation

- [ ] Dupliquer un calque le recrée juste au-dessus, formes, modificateurs,
      interpolations et liaisons comprises.
- [ ] Les identifiants de la copie sont neufs : modifier la copie ne touche pas
      l'original.
- [ ] Dupliquer une forme la recrée dans le même calque, légèrement décalée et
      sélectionnée.
- [ ] La copie devient le calque ou la forme active.
