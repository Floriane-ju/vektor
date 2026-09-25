---
{
  "id": "T-0074",
  "titre": "Multi-sélection, lasso et poignées de transformation",
  "colonne": "pret",
  "priorite": "moyenne",
  "charge": "xl",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Le modèle ne porte qu'un `activeElementId`. Pas de Maj+clic, pas de lasso ; le
cadre de sélection (`renderer-svg.js:599-610`) n'a pas de poignées : taille et
rotation ne se règlent qu'au panneau. Glisser dans le vide déplace la forme
sélectionnée (`toolbar.js:310-315`), ce qui ferme la porte à un lasso.

## Critères d'acceptation

- [ ] **À trancher** : glisser dans le vide = lasso, ou garder le déplacement ?
- [ ] **À trancher** : poignées sur la copie source seulement, ou sur le calque entier ?
- [ ] **À trancher** : sélection multiple limitée à un calque ?
- [ ] Une fois tranché : déplacer, dupliquer, supprimer plusieurs formes en un geste et un pas d'historique.
