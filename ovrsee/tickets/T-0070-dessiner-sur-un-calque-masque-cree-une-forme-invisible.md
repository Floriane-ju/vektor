---
{
  "id": "T-0070",
  "titre": "Dessiner sur un calque masqué crée une forme invisible",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "xs",
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

`pointerdown` (`toolbar.js:450-457`) ajoute la forme au calque actif sans lire
`layer.visible`, et le rendu saute les calques masqués (`renderer-svg.js:27`).
On dessine, rien n'apparaît, les formes fantômes s'accumulent.

## Critères d'acceptation

- [ ] Dessiner sur un calque masqué le réaffiche (même pas d'historique que la forme).
- [ ] Test app : calque masqué + geste de dessin → forme visible sur le plan.
