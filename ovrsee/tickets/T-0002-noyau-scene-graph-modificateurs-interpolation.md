---
{
  "id": "T-0002",
  "titre": "Noyau : scene graph, modificateurs, interpolation",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "m",
  "tags": ["core"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

C'est la fondation dont dépendent le renderer, l'UI et la persistance. Le brief
désigne l'interpolation et le miroir axial comme les deux pièces que les
critères d'acceptation testent le plus précisément — elles se font en premier,
avec leur test.

La rampe `t(i, n) = n <= 1 ? 0 : i / (n - 1)` est définie une seule fois dans
`interpolate.js` et importée par `modifiers.js`, pour que position et
propriétés partagent exactement la même échelle et le même garde-fou `n = 1`.

Un seul modificateur par calque en v1 (champ `modifier`, pas `modifiers[]`).

## Critères d'acceptation

- [ ] `interpolateProps({ opacity: [1, 0] }, i, 5)` pour `i = 0..4` rend
      exactement `1, 0.75, 0.5, 0.25, 0`.
- [ ] `axial(el, 6, center)` rend 6 enfants, angles espacés de 60°, tous à
      distance constante du centre.
- [ ] `mirrorH(el, 2, center)` rend la base et son reflet ; `mirrorH(el, 5, center)`
      rend 5 copies réparties sur l'axe.
- [ ] `n = 0` et `n = 1` ne produisent ni `NaN` ni division par zéro : un seul
      enfant, à la valeur de départ.
- [ ] `Layer.getRenderedChildren()` applique transform positionnel puis
      propriétés interpolées en une passe.
- [ ] Toutes les mises à jour de scène sont immuables : elles renvoient une
      nouvelle `Scene`, l'ancienne est inchangée.
- [ ] `pnpm test` passe.
