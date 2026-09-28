---
{
  "id": "T-0138",
  "titre": "Erreurs avalées ou mal libellées dans l'interface",
  "colonne": "en-cours",
  "priorite": "basse",
  "charge": "xs",
  "tags": [
    "ui",
    "robustesse"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": "2026-09-28-audit-front-tickets-ovrsee-aucun-code-modifie.md",
  "epic": "T-0127"
}
---

## Contexte

- `src/ui/list.js:96` : `.catch(() => {})` sans commentaire (animation annulée, légitime mais muet).
- `src/ui/export-menu.js:61` : tout échec de `toPng` s'affiche « presse-papier refusé », y compris un échec de rendu.
- `src/ui/drawing-tabs.js:25` : `update` ignore le `false` renvoyé par `saveDrawings` : l'écriture ratée de la liste d'onglets n'est jamais signalée.
- `src/ui/drawing-tabs.js:64` : déstructure `tabs.find(...)` sans garde.

## Critères d'acceptation

- [ ] Un échec d'écriture de la liste d'onglets est signalé à l'écran.
- [ ] Le message d'export PNG distingue échec de rendu et refus du presse-papier.
- [ ] Le `catch` vide de `list.js` porte un commentaire ; le `find` a sa garde.
