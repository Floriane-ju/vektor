---
{
  "id": "T-0073",
  "titre": "Réordonner au glisser et changer une forme de calque",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": "2026-09-24-tickets-issus-du-tour-de-code-2026-09-24.md",
  "epic": "T-0032"
}
---

## Contexte

L'arbre ne réordonne que par boutons ↑/↓ (`layer-panel.js:151-164`,
`shape-list.js:172-185`) : passer du 1er au 8e rang coûte 7 clics. Aucune
transition ne passe une forme dans un autre calque (`moveElement`,
`scene.js:659`, ne change que le rang) : il faut la supprimer et la redessiner.

## Critères d'acceptation

- [ ] Glisser-déposer une ligne de calque ou de forme la déplace dans l'arbre, en un pas d'historique.
- [ ] Déposer une forme sous un autre calque l'y déplace ; ses booléens vers l'ancien calque sont retirés, ceux qui la visaient aussi.
- [ ] Test core de la nouvelle transition.
