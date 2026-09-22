---
{
  "id": "T-0004",
  "titre": "Panneaux calques, propriétés et toolbar",
  "colonne": "fait",
  "priorite": "haute",
  "charge": "m",
  "tags": [
    "ui",
    "a11y"
  ],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

L'UI ne détient aucun état : chaque contrôle émet une action de store, le store
notifie, le renderer réémet. Pas de bouton « Appliquer » — les sliders mettent à
jour en direct.

Réordonnancement par boutons ↑/↓ plutôt que par glisser-déposer : le brief
acceptait les deux, et les boutons sont accessibles au clavier sans travail
supplémentaire.

## Critères d'acceptation

- [ ] Cliquer sur le stage avec un calque actif place un cercle, qui figure dans
      le scene graph.
- [ ] Canvas vide : le texte « Cliquer pour ajouter une forme » s'affiche.
- [ ] Sans calque actif, le panneau propriétés est `disabled` et
      `aria-disabled`.
- [ ] Le sélecteur de modificateur propose `none`, `mirrorH`, `mirrorV`,
      `axial`, `spiral` ; `angleStep` et `radiusStep` n'apparaissent que
      pour `spiral` ; `n` a `min="1"`.
- [ ] Réordonner deux calques met à jour le z-order immédiatement, sans
      rechargement.
- [ ] Supprimer un calque demande confirmation ; la touche Suppr déclenche le
      même geste.
- [ ] Tous les contrôles sont atteignables au clavier ; les boutons icône ont un
      `aria-label` ; la bascule de visibilité porte `aria-pressed`.
