---
{
  "id": "T-0101",
  "titre": "Verrouiller un calque",
  "colonne": "pret",
  "priorite": "moyenne",
  "charge": "s",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-27",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Rien n'empêche de déplacer ou modifier par erreur un calque fini : un clic sur
le plan sélectionne et un glisser déplace la forme de n'importe quel calque.
Aucun champ `locked` dans le modèle (grep vide).

## Critères d'acceptation

- [ ] Cadenas dans l'arbre à côté de l'œil (`layer-panel.js`), bascule en un clic.
- [ ] Calque verrouillé : ses formes ne se sélectionnent ni ne se déplacent sur le
      plan ; le panneau reste lisible mais ses champs sont désactivés.
- [ ] Le verrou entre dans l'historique ; `layer.locked` sérialisé, `FORMAT` bumpé.
- [ ] Test : calque verrouillé, `pointerdown` sur une de ses formes → sélection inchangée.
