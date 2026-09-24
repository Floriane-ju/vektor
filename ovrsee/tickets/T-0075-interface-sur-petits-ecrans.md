---
{
  "id": "T-0075",
  "titre": "Interface sur petits écrans",
  "colonne": "a-specifier",
  "priorite": "basse",
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

`style.css` n'a aucune `@media`. Les gouttières sont fixes (336 / 360 px) et le
plan est borné à `calc(100vw - 336px - 360px)` : sous ~1100 px le dessin rétrécit,
vers 700 px il disparaît. Les actions de ligne n'apparaissent qu'au survol
(`style.css:379-383`), inaccessibles au tactile.

## Critères d'acceptation

- [ ] **À trancher** : panneaux repliables, tiroirs, ou onglets ; seuil de bascule.
- [ ] Une fois tranché : à 1024 px le plan garde au moins la moitié de la largeur ; les actions de ligne sont atteignables sans survol.
