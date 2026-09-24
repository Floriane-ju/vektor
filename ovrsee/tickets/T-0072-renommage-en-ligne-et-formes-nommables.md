---
{
  "id": "T-0072",
  "titre": "Renommage en ligne, et formes nommables",
  "colonne": "backlog",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Renommer un calque passe par `prompt()` au double-clic (`layer-panel.js:124-131`) :
boîte native hors thème, aucun chemin clavier. Les formes n'ont pas de nom :
leur libellé est calculé sur leur rang (`list.js:86-87`), donc « Ellipse 2 »
devient « Ellipse 1 » après ↑, y compris dans le menu « Outil » d'un booléen.

## Critères d'acceptation

- [ ] Renommage en place (double-clic ou F2), Entrée valide, Échap annule — calques et formes.
- [ ] Une forme nommée garde son nom quand on la réordonne ; sans nom, libellé par défaut.
- [ ] `element.name` optionnel sérialisé, format bumpé.
