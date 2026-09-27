---
{
  "id": "T-0102",
  "titre": "Calque suspendu signalé dans l'arbre, compteur décomposé",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "xs",
  "tags": [
    "ui",
    "modificateurs"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-27",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Au-delà de `MAX_COPIES` (`isSuspended`, `scene.js:480`), le calque disparaît du
plan ; seul le texte de la section « Répéter » le dit
(`modifier-section.js:231-233`). L'arbre ne montre rien : le calque semble vide
ou le geste raté. Le message donne le total sans dire d'où il vient (copies du
calque × copies propres des formes, `copyTotal`), donc ni quel étage réduire.

## Critères d'acceptation

- [ ] Un calque suspendu porte une icône d'alerte dans l'arbre, avec un `title`
      « Rendu suspendu : N copies ».
- [ ] Le message du panneau décompose : « 40 copies du calque × 60 des formes =
      2 400 — rendu suspendu au-delà de 2 000 ».
