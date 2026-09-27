---
{
  "id": "T-0120",
  "titre": "Booléens réservés aux formes fermées",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "tags": ["booleens"],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": null
}
---

## Contexte

Un point, une ligne, un tracé ouvert ou un arc ouvert n'ont pas d'intérieur : une opération booléenne sur eux n'a pas de sens.

## Critères d'acceptation

- [ ] Une forme ouverte ne peut pas recevoir d'opération booléenne (section masquée, `addBoolean` sans effet).
- [ ] Une forme ouverte n'est jamais proposée comme outil.
- [ ] Ouvrir une forme (tracé, arc) retire les opérations qui l'impliquent.
- [ ] Un fichier importé perd les opérations impliquant une forme ouverte.
