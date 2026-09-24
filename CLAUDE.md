# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Vektor (ex-Illu) : outil web d'illustration vectorielle générative (esprit « Retro Futuristic Elements »). On compose des formes sur des calques ; chaque calque porte une pile de modificateurs (pas, miroirs, axial, spirale) qui le duplique, et une pile d'interpolations qui fait varier opacité/échelle le long des copies. Export SVG, sauvegarde JSON.

Écarts avec le brief initial — ce qui fait foi est le code :
- **Pas de p5.js.** Rendu en SVG DOM direct (`#stage` dans `index.html`). Un seul moteur de rendu : le `<svg>` à l'écran est à la fois l'aperçu et la source de l'export, il n'y a pas de `renderer-canvas.js`.
- **Plusieurs modificateurs par calque** (`layer.modifiers[]`, empilés), plusieurs formes par calque (`layer.elements[]`), interpolations empilées (`layer.interpolations[]`).
- Vanilla JS (ES modules), Vite, Vitest. Interface et commentaires en français.

## Commandes

`pnpm` uniquement (scripts de cycle de vie bloqués, cf. `pnpm-workspace.yaml`).

```sh
pnpm dev                          # Vite sur http://localhost:5173
pnpm build                        # dist/
pnpm test                         # vitest run (tout)
pnpm test test/core.test.js       # un fichier
pnpm test -t "axial"              # tests dont le nom contient « axial »
```

Pas de linter ni de formateur configuré.

## Architecture

Flux unidirectionnel : **transition pure → store → render**.

- `src/scene.js` — modèle + **toutes les transitions**, immuables, signature `(scene, ...args) -> scene`. Renvoyer la même référence = geste sans effet, le store ne notifie pas. Contient aussi les sources uniques : `SHAPES`, `RANGE_BOUNDS`, `STAGE`, `getRenderedChildren(layer)`.
- `src/store.js` — store minimal ; l'UI appelle `store.apply(transition, ...args)`, jamais de mutation ni de type d'action. Porte l'historique (pile de scènes, `HISTORY_LIMIT`) : un changement de sélection seule n'y entre pas, `begin(key)`/`end(key)` regroupent un geste continu en un pas — câblés au niveau du document dans `ui/history.js` (pointerdown→pointerup, input→change).
- `src/modifiers.js` — un modificateur transforme **un point** `(point, i, n, center, options) -> {x, y, angle, flip}`, appliqué au calque entier (le motif bouge en bloc). `angle`/`flip` = orientation de la copie, composée dans `applyStack` si `orients(modifier)` (case « Orienter les copies », défaut actif sur miroirs/axial/spirale), puis ajoutée à la rotation propre dans `getRenderedChildren`. Les transformations doivent rester des similitudes, sinon le motif se disloque copie après copie. Pile = produit cartésien des indices (`stackCopies`), appliquée dans l'ordre (`applyStack`) — l'ordre change le dessin. `FIXED_COPIES` : miroirs = 2 copies, `none` = 1. Pivot : `modifier.center` (optionnel, types de `PIVOTING`) sinon `layer.center` — `pivotOf(layer, index)` dans `scene.js` est la source unique (rendu des repères, glisser dans la toolbar via `data-pivot`, panneau).
- `src/interpolate.js` — rampe `t(i, n)` partagée (garde n ≤ 1 → 0, seul endroit), `clampCount` (n ≥ 1). Deux interpolations de la même propriété se composent **par produit** (neutre = 1), sauf les propriétés `additive` de `RANGE_BOUNDS` (rotation : somme, neutre 0). L'épaisseur interpolée est un facteur de celle du calque. `binding` = rang d'un modificateur de la pile (la rampe ne suit que cet étage) ou `null` (rampe sur le total des copies). Réordonner/supprimer un modificateur doit remapper les bindings (`remapBindings` dans `scene.js`).
- `src/renderer-svg.js` — `render(scene, svgRoot)` reconstruit le SVG depuis `getRenderedChildren`, plus les repères (`data-guides`) du calque actif et le cadre pointillé de sélection (`data-selection` : boîte de la copie source de la forme, ou de tout le calque sans forme sélectionnée ; `childBounds` la calcule sans `getBBox`). `toSvgDocument` clone le DOM et retire repères/survol pour l'export.
- `src/persistence.js` — `serialize`/`deserialize` + autosave localStorage (debouncée dans `main.js`). Format versionné (`FORMAT = 'vektor/scene@N'`, anciens `illu/scene@N` jusqu'à `@16`) : **tout changement du modèle** doit bumper le format et garder les anciens lisibles (`READABLE_FORMATS` + lecture legacy), import validé et borné champ par champ. `STORAGE_KEY` (`illu:scene:v1`) et `illu/settings` gardent l'ancien nom, exprès.
- `src/ui/*` — interface « design E » (panneaux flottants sur le plan plein écran : arbre calques → formes à gauche, réglages du calque OU de la forme à droite, outils en bas) ; panneaux DOM montés par `main.js` (`mount*({ store, container, ... })`), qui s'abonnent au store. Helpers communs dans `ui/list.js` (reconstruction en gardant le focus, `whenChanged`).

Conventions du modèle :
- Style (couleur `stroke`, `strokeWidth`) sur le **calque**, pas la forme ; une forme n'a que `filled` (rempli = couleur du calque) et son style de trait (`dash` en multiples de l'épaisseur × échelle de la copie, `linecap`).
- `x, y` = centre de la forme, `rx, ry` = demi-extensions (signées seulement pour `line`, via `clampExtent`). Le « point » est une ligne de longueur nulle à bout rond, dimensionné par l'épaisseur.
- Le tracé (`polyline`) porte `points` relatifs à `x, y`, recentré sur sa boîte englobante (`recenterTrace`) après chaque geste. Import collé par `src/path.js` (segments droits M/L/H/V/Z seulement). Poignées de sommets (`data-handles`) = état d'écran, retirées à l'export comme les repères.
- Booléens : `element.booleans = [{ with, op }]`, pile appliquée dans l'ordre (`union`/`subtract`/`intersect`), `with` = autre forme du même calque (l'outil, non dessiné). Rendu par masques emboîtés (`createBoolean` dans `renderer-svg.js`), chaque copie avec la copie de l'outil de même rang (`child.copy`).
- IDs préfixés `L`/`E`/`I` ; `reserveIds` après chargement pour éviter les collisions.
- Commentaires `ponytail:` = simplification délibérée avec son plafond (ex. pas de mémoïsation de `getRenderedChildren`).

## Tests

- `test/core.test.js` — modèle, modificateurs, interpolation (pur, Node).
- `test/render.test.js`, `test/app.test.js` — `// @vitest-environment happy-dom` en tête de fichier ; `app.test.js` est une fumigation qui monte toute l'appli.

## Suivi (ovrsee/)

Plans dans `ovrsee/plans/`, tickets `ovrsee/tickets/T-XXXX-*.md` (frontmatter JSON, colonnes dans `ovrsee/board.json`). Un hook bloque toute édition sans plan ni ticket actif : passer par les skills `ovrsee` / `ovrsee-tickets`. Commits : Conventional Commits en français.
