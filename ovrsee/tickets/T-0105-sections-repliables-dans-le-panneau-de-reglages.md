---
{
  "id": "T-0105",
  "titre": "Sections repliables dans le panneau de réglages",
  "colonne": "en-cours",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Le panneau de droite empile géométrie, trait, 3D, « Répéter », interpolations et
booléens (`property-panel.js`, titres `h3` de `fields.js:62`). Dès deux
modificateurs et deux interpolations il défile, et la section qu'on règle passe
sous le bord ; rien ne se replie. L'arbre de gauche sait déjà replier un calque
(`layer-panel.js:28`).

## Critères d'acceptation

- [x] Clic sur un titre de section (ou Entrée au clavier) la replie/déplie, chevron
      et `aria-expanded` à jour.
- [x] L'état replié est mémorisé par section dans `illu/settings`, partagé entre
      calque et forme, et survit au rechargement.
- [x] Une section repliée affiche un résumé (ex. « 3 étages », « 2 interpolations »).
