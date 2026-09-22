---
{
  "id": "T-0003",
  "titre": "Renderer SVG DOM et export de fichier",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "s",
  "tags": ["render"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

Décision structurante du plan : pas de p5.js, pas de double renderer. Le preview
est rendu directement dans le `<svg>` du DOM, et l'export sérialise ce même
nœud. Le risque de divergence canvas/SVG listé dans le brief disparaît par
construction — il n'y a rien à re-vérifier entre deux moteurs.

Pas de mémoïsation : sans boucle `draw()`, le re-render n'a lieu que sur
notification du store.

## Critères d'acceptation

- [ ] Un `<g data-layer-id>` par calque visible, dans l'ordre du tableau
      `layers` (index 0 = fond).
- [ ] Un `<circle>` par enfant ; `scale` multiplie le rayon, `opacity`
      alimente `fill-opacity` et `stroke-opacity`.
- [ ] Un calque invisible n'émet aucun nœud.
- [ ] « Export SVG » télécharge un `.svg` ouvrable, avec `xmlns`, `width`,
      `height` et `viewBox` sur la racine.
- [ ] Le fichier exporté a le même nombre de `<circle>` et les mêmes positions
      que le preview à l'écran.
