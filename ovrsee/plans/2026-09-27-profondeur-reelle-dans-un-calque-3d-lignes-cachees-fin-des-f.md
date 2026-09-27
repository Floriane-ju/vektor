---
{
  "status": "open",
  "title": "Profondeur réelle dans un calque 3D (lignes cachées), fin des formes logées",
  "opened": "2026-09-27",
  "closed": null,
  "commits": [
    {
      "sha": "1f43b36",
      "date": "2026-09-27",
      "files": [
        "CLAUDE.md",
        "package.json",
        "pnpm-lock.yaml",
        "src/plane.js",
        "src/renderer-svg.js",
        "src/scene.js",
        "src/ui/property-panel.js",
        "src/ui/shape-fields.js",
        "test/render.test.js"
      ]
    },
    {
      "sha": "b305c57",
      "date": "2026-09-27",
      "files": []
    },
    {
      "sha": "1561b1c",
      "date": "2026-09-27",
      "files": [
        "test/core.test.js"
      ]
    },
    {
      "sha": "e80e725",
      "date": "2026-09-27",
      "files": [
        "src/main.js",
        "src/persistence.js",
        "test/persistence.test.js"
      ]
    }
  ]
}
---

# Profondeur réelle dans un calque 3D (lignes cachées), fin des formes logées

## Contexte

Aujourd'hui, dans un calque en plan 3D, qui passe devant dépend de l'**ordre de dessin** (`occlude` : chaque volume masque ce qui est dessiné avant lui), plus des cas particuliers : `createInside` (formes logées, tranchées), `wallNeighbours`/`sheet` (rubans), `chain`/`nearRuns` (moitié proche du fond). Résultat : trois cylindres au fond du dessin passent devant l'anneau du premier plan (image 1) au lieu d'être derrière (image 3).

Cible (façon Blender) : **dans un calque**, ce qui est plus loin en profondeur est caché par ce qui est devant, quel que soit l'ordre des formes. Ce qui est dans un volume est dedans (l'axe traverse l'anneau : caché dans la matière, visible dans le trou). Le lien « à l'intérieur de » disparaît.

Décisions de l'utilisatrice :
- Profondeur **par calque seulement**. Entre calques : ordre de l'arbre, comme aujourd'hui (un calque du dessus cache celui du dessous).
- Aplats : tri par face (peintre) ; traits exacts.
- « Opaque » éteint = **fil de fer** : ses faces ne cachent rien, pas même ses propres arêtes arrière.

Prérequis : T-0115 (booléen extrudé, `booleanPieces`, `polygon-clipping`) est en cours dans l'arbre de travail d'une autre session — attendre qu'il soit commité, puis partir de là. Ses morceaux sont des tracés fermés ordinaires : ils entrent tels quels dans le nouveau modèle.

## Approche : suppression des lignes cachées par calque

Un calque = un seul plan, projection parallèle → la profondeur de tout point est linéaire et exacte :
`depth = u·sin(tilt) + h·cos(tilt)`, `u = (p − O)·ŝ`, `ŝ = (−sin heading, cos heading)` (axe comprimé de `planeMatrix`), `h` = hauteur le long de la normale (même convention que `extrusion`). Positif = vers le spectateur (bas de l'écran et face du haut plus proches). Un test le vérifie sur l'exemple de l'utilisatrice.

### Nouveau module pur `src/hidden.js` (testable sous Node)

1. `meshOf(child, v)` — depuis une copie centrée (réutilise `outlinePath`, `planeDouble`, `planeBand`/`openBand`, `silhouette`, `project`) :
   - **faces** `{ rings: [points écran], depth: coefficients du plan de la face, fill?, occludes }` :
     - volume fermé : face du haut, face du bas, une paroi (quad) par segment ;
     - anneau (contour double fermé) : faces haut/bas trouées (deux anneaux, pair-impair), parois extérieures **et** intérieures ;
     - bande (contour double ouvert) : faces haut/bas de la bande, parois ;
     - tracé ouvert extrudé (ligne, arc, tracé) : parois seules (feuille) ;
     - forme plate (profondeur 0) : une face seulement si remplie ;
     - `occludes = child.opaque !== false`.
   - **arêtes** `{ a, b, depthA, depthB, style }` : contours haut et bas, arêtes de flanc aux sommets de `silhouette` et aux `corners` (extérieur et trou), axe d'un point extrudé, contours d'une forme plate.
2. `visibleRuns(edge, faces)` — pour chaque face qui cache et dont la boîte recoupe celle de l'arête : intervalle du segment strictement dans la face (croisements avec ses bords, pair-impair — gère les trous et le non-convexe) ∩ intervalle où la face est devant (différence de profondeur linéaire le long du segment, tolérance ε pour les arêtes sur la face même). Union des intervalles cachés, complément = morceaux visibles (reprend la logique de complément et `GAP` de `backRuns`/`flankRuns`).
3. `hiddenLines(children)` — calque entier : toutes les faces, puis les morceaux visibles de chaque arête, regroupés par forme ; aplats triés par profondeur du centroïde (loin → près).

`// ponytail:` à poser : tri des aplats au peintre (deux faces remplies qui se traversent peuvent se chevaucher mal) ; balayage O(arêtes × faces) élagué par boîtes — grille si le banc rame ; tirets repartant à chaque morceau ; face occultante non élargie de la demi-épaisseur du trait.

### `src/renderer-plane.js` — réécrit autour de `hidden.js`

- `drawPlaneLayer(children)` rend un bloc `<g>` : groupe des aplats triés, puis un `<g data-element-id>` par forme avec un `<path>` par style (couleur, épaisseur, opacité, `linecap`, tirets ; point = bout rond ; bande = `linejoin` rond). Chaque aplat porte aussi `data-element-id` (clic, survol).
- **Supprimés** : `createExtrusion` (chain, sides, masques de face avant), `createWalls`, `backRuns`, `flankRuns`, `within`, `wallNeighbours`, `foreignWalls`, `convex`, `hidesItself`, `createInside`, `createOpening`, `shapeOccluder`, `flushCorner`, `nearRuns`/`nearEdges`/`facingAway` (si plus utilisés), `sheet` dans `plane.js`.
- **Gardés** : `occlude` + `createOcclusion`/`shadowOf` + `occluder` (plane.js) pour l'occlusion **entre calques** : le bloc d'un calque 3D est un seul nœud dessiné, son occulteur = `{ parts }` des silhouettes (`occluder`) de ses volumes opaques. Il masque les calques en dessous, jamais lui-même.

### `src/renderer-svg.js` — `drawLayer`

- Calque sans plan : inchangé.
- Calque en plan : copies (y compris morceaux de `booleanPieces`, contours de `evenOdd` sans aplat) → `drawPlaneLayer`. Restent à plat, dessinés avant le bloc, hors profondeur (comme aujourd'hui) : repli `createBoolean` (résultat troué/ouvert) et aplat pair-impair.
- Retirer `hostChain`, `nodeOf`, le tri « après son hôte », `walls`. Vérifier `showHover`/`elementsInBox`/gestes quand une forme a plusieurs nœuds `data-element-id` (aplat + traits).

### Fin des formes logées

- `src/scene.js` : retirer `element.inside`, `setInside`, `insideLoop`, remappage de `inside` dans duplication/suppression ; `isClosedShape` si plus utilisé ailleurs.
- `src/persistence.js` : format **`@33`**, `@32` et antérieurs lisibles, `inside` ignoré à la lecture (`readInside` supprimé).
- UI : supprimer `src/ui/inside-field.js` et son montage dans `property-panel.js`, la branche `.inside-branch` de `ui/shape-list.js` + CSS.
- `CLAUDE.md` : réécrire le paragraphe Plan 3D (profondeur par calque, `hidden.js`, Opaque = fil de fer), supprimer la puce « Forme logée ».

## Tests (TDD, avant le code)

- `test/hidden.test.js` (Node) : signe de `depth` (face du haut plus proche, bas de l'écran plus proche) ; arête derrière un carré coupée au milieu, devant intacte, sur la face intacte ; arête vue par le trou d'un anneau ; paroi d'un tracé ouvert qui cache.
- `test/render.test.js` : scène de l'image 2 (trois cercles en haut + anneau, cercle intérieur, point axe en bas, calque 3D 45°/45°) → les arêtes des cylindres du fond sont coupées là où l'anneau passe devant ; **même résultat en inversant l'ordre des formes** ; l'axe caché dans la matière de l'anneau, visible dans le trou ; `opaque: false` → arêtes arrière visibles ; calque du dessus masque toujours celui du dessous.
- Retirer/adapter les tests `inside`, `createInside`, `sheet`, `wallNeighbours`, occlusion intra-calque par ordre.

## Vérification

1. `pnpm test` vert.
2. `BENCH=1 pnpm vitest run bench/ --silent=false` avant/après : temps de `render` pas pire que ×2, sinon grille.
3. `pnpm dev`, refaire la scène de l'image 2 en 3D : rendu conforme à l'image 3 quel que soit l'ordre des formes ; export SVG identique à l'écran.

## Suivi

Ticket ovrsee (skill `ovrsee-tickets`) créé au démarrage, lié à ce plan ; commits en Conventional Commits français (`feat:` profondeur, `refactor:` retrait des formes logées).
