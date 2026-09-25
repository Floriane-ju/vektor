---
{
  "status": "open",
  "title": "Répétitions et itérations portées aussi par la forme (format @25)",
  "opened": "2026-09-25",
  "closed": null,
  "commits": []
}
---

# Répétitions et itérations portées aussi par la forme (format @25)

## Context
Aujourd'hui seules les calques portent `modifiers[]` (« Répéter ») et `interpolations[]` (« Faire varier les itérations »). Nouvelle logique : une forme peut porter les siennes, qui **s'accumulent** avec celles du calque (forme d'abord, puis calque). La répétition linéaire d'un point ne suit plus que les étages de **sa propre** pile (case par étage conservée, retirée des étages de calque). Le plan 3D reste porté par le calque seul (déjà le cas : appliqué après toutes les piles, au rendu).

Décisions validées :
- Ordre : pile de la forme puis pile du calque.
- Pivot par défaut d'un étage de forme = pivot du calque (`modifier.center ?? layer.center`).
- Case « Activer les répétitions linéaires » par étage, uniquement dans la pile d'un point.
- Fichiers @24 avec points reliés via le calque : lien oublié (points normaux).

## Étapes

0. **Suivi** : ticket via skill `ovrsee-tickets` (le hook bloque sinon), passé en cours.

1. **Modèle — `src/scene.js`, `src/modifiers.js`**
   - `createElement` : `modifiers: []`, `interpolations: []` par défaut ; `addElement` n'hérite pas des piles.
   - `applyStack(point, modifiers, indices, center)` : partir de `{ x, y, angle: point.angle ?? 0, flip: point.flip ?? false }` pour chaîner forme → calque sans perte d'orientation.
   - Transitions de pile existantes (`addModifier`, `removeModifier`, `moveModifier`, `updateModifier`, `add/remove/clear/updateInterpolation(Range)`) : remplacer `mapLayer` par un `mapOwner(scene, id, fn)` qui applique `fn` au calque **ou** à la forme d'id `id` (préfixes L/E). Signatures inchangées ; `remapBindings` marche tel quel sur l'une ou l'autre.
   - `pivotOf(layer, index, owner = layer)` → `owner.modifiers[index]?.center ?? layer.center`.
   - `getRenderedChildren` : pour chaque copie `i` du calque, chaque forme, chaque copie propre `j` (`stackCopies(element.modifiers)`) : position = `applyStack(applyStack(element, element.modifiers, own, layer.center), layer.modifiers, indices, layer.center)` ; valeurs = `stackValues([...layer.interpolations, ...element.interpolations], factorOf)` (la couleur de la forme l'emporte, produit/somme inchangés). `rangeFactor` généralisé à `(owner, interpolation, indices, i, total)` : interpolation de forme → étage de sa pile ou total de ses copies propres. Enfant porte `copy: i` et `own: j`.
   - `isSuspended` / nouveau `copyTotal(layer)` = `copyCount(layer.modifiers) × Σ copyCount(element.modifiers)` > `MAX_COPIES`.
   - `linkPoints` : par forme et par copie de calque, sur les copies propres du point, le long de `linearStages(element.modifiers)` (même calcul de pas, `count = 1`). Les `linear` des étages de calque sont ignorés.
   - `duplicateLayer` (et la duplication de forme s'il y en a) : ids neufs pour les interpolations des formes ; `reserveIds` les réserve aussi.

2. **Rendu — `src/renderer-svg.js`**
   - Clés `${id}:${copy}` → `${id}:${copy}:${own}` (`nodeOf`, `byCopy`, ids de masques). Outil booléen et hôte `inside` : même `(copy, own)`, sinon repli sur `(copy, 0)` — `ponytail:` commentaire (outil répété sans cible répétée : seule sa copie 0 sert).
   - `createGuides` : ajoute les étages de la forme active (si calque actif), groupe `data-pivot` + `data-pivot-owner` = id de la forme ; `ui/toolbar.js` lit le propriétaire pour `updateModifier`/`pivotOf`.

3. **Persistance — `src/persistence.js`**
   - `FORMAT = 'vektor/scene@25'`, `@24` dans `READABLE_FORMATS`, note d'historique (`@1` à `@24` : formes sans pile propre ; points reliés via le calque → lien oublié).
   - `readElement` : `modifiers` (via `readModifiers`, `linear` gardé seulement pour un point) et `interpolations` (`readInterpolations(raw, modifiers.length)`). `readModifier` pour un calque : `linear` retiré.

4. **Interface — `src/ui/`**
   - Extraire le bloc « Répéter » de `property-panel.js` (≈ l. 483-673, fichier à 781 l.) dans `ui/modifier-section.js` : `modifierSection({ store, ownerOf, linear })` avec `ownerOf(scene)` = calque actif ou forme active ; `sync(layer, owner)`. Deux instances : calque (pivot du calque + total, case linéaire jamais montrée) et forme (sans champs de pivot du calque ; case linéaire par étage si la forme est un point).
   - `interpolation-section.js` : paramètre `ownerOf` au lieu de `getActiveLayer`, `sync(owner)` ; deuxième instance dans le panneau forme (liaisons vers les étages de la forme).
   - Case « Répétition linéaire » du point : visible seulement si le point a au moins un étage non `none` dans sa propre pile ; le groupe trait suit comme aujourd'hui.
   - Total de copies : section calque affiche `copyTotal(layer)` (suspension), section forme ses copies propres.

5. **Docs** : `CLAUDE.md` (modificateurs/interpolations sur calque et forme, ordre, pivot, linéaire, @25).

## Réutilisé
`stackCopies`, `applyStack`, `copyCount`, `effectiveCount`, `stackValues`, `ramp`, `remapBindings`, `linearStages`/`chain`, `readModifiers`/`readInterpolations`, `rebuildWithFocus`/`iconButton` (`ui/list.js`).

## Vérification
- `test/core.test.js` (TDD, d'abord rouge) : accumulation forme × calque (positions, orientation chaînée, nombre d'enfants) ; interpolation de forme composée avec celle du calque (produit, couleur de la forme l'emporte) ; point linéaire relié par sa pile seule, étage linéaire de calque ignoré ; transitions de pile sur une forme (ajout, déplacement + remap des bindings) ; suspension sur le total ; lecture @24 (lien oublié) et aller-retour @25 ; bornes de l'import.
- `test/render.test.js` : booléen/forme logée avec outil et cible répétés (appariement `(copy, own)` et repli).
- `pnpm test` complet vert, `pnpm build`, puis `pnpm dev` : ligne × axial sur la forme dans un calque en pas × 5 ; point linéaire ; calque en 3D.
