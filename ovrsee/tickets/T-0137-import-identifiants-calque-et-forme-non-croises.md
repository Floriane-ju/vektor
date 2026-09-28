---
{
  "id": "T-0137",
  "titre": "Import : identifiants calque et forme non croisés",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "s",
  "tags": [
    "persistance",
    "robustesse"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

`src/persistence.js:479-486` vérifie l'unicité des ids de calques, puis celle des ids de
formes, jamais les uns contre les autres ; leur format (`L…`/`E…`) n'est pas validé.
Un fichier avec un calque `E1` et une forme `E1` s'importe, puis `mapOwner`
(`src/scene.js:1158`) route les modificateurs et interpolations de la forme vers le calque.

Au passage : aucun plafond sur le nombre de calques, formes, étages, interpolations ;
nom de calque ni tronqué ni borné (`readLayer`, `:444`, contrairement à `readName`) ;
ids d'interpolation non dédoublonnés.

## Critères d'acceptation

- [ ] Un fichier à ids croisés calque/forme est refusé avec un message clair.
- [ ] Ids validés par préfixe (`/^[LEI]\d+$/` ou équivalent), sinon refus ou réattribution.
- [ ] Nom de calque borné comme celui des formes.
- [ ] Tests dans `test/persistence.test.js`.
