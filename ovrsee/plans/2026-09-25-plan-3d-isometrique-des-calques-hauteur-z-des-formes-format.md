---
{
  "status": "closed",
  "title": "Plan 3D isométrique des calques + hauteur Z des formes (format @23)",
  "opened": "2026-09-25",
  "closed": "2026-09-25",
  "commits": [
    {
      "sha": "3bf8ed7",
      "date": "2026-09-25",
      "files": [
        "CLAUDE.md",
        "src/persistence.js",
        "src/plane.js",
        "src/renderer-svg.js",
        "src/scene.js",
        "src/ui/icons.js",
        "src/ui/layer-panel.js",
        "src/ui/property-panel.js",
        "src/ui/toolbar.js",
        "style.css",
        "test/core.test.js",
        "test/render.test.js"
      ]
    },
    {
      "sha": "f2789d3",
      "date": "2026-09-25",
      "files": [
        "CLAUDE.md",
        "src/persistence.js",
        "src/plane.js",
        "src/renderer-plane.js",
        "src/renderer-svg.js",
        "src/scene.js",
        "src/ui/inside-field.js",
        "src/ui/property-panel.js",
        "src/ui/shape-list.js",
        "style.css",
        "test/core.test.js",
        "test/render.test.js"
      ]
    }
  ]
}
---

# Plan 3D isométrique des calques + hauteur Z des formes (format @23)

## Contexte
Effet « Retro Futuristic » des exemples : anneaux vus en perspective parallèle, épaisseur extrudée, arêtes cachées masquées, axe traversant (= point extrudé). Choix validés :
- Plan = **réglage du calque**, appliqué **après** la pile de modificateurs (motif composé à plat, puis incliné).
- **2 angles libres** : inclinaison (0–89°) + orientation (0–360°), projection orthographique, défaut ≈ isométrique (inclinaison 54.7°, orientation 0).
- **Épaisseur seule** par forme (`height`, signée ; négatif = vers le dessous).
- Arêtes cachées **masquées** par la face avant de la forme (pas d'occlusion entre formes).
- Flancs `transparent` (traits seuls) ou `filled` (aplat de la couleur de la forme, teinté) — réglage du calque.

## Modèle (`src/scene.js`)
- `createLayer` : `plane: null` (absent = rendu actuel inchangé). Actif : `{ tilt, heading, sides: 'transparent' | 'filled' }`.
- `createElement` : `height: 0`.
- `clampTilt` [0, 89], `clampHeading` (réutiliser logique `clampAngle`), `MAX_HEIGHT` + `clampHeight`, `PLANE_SIDES` labels.
- Transition `setLayerPlane(scene, id, patch | null)` (même référence si rien ne change). Hauteur via `updateElement` existant.
- `getRenderedChildren` : rien à changer (`height` passe par `...element`, l'échelle de copie s'applique au rendu).

## Maths + contour ordonné (nouveau `src/plane.js`, pur)
- `planeMatrix(plane, center)` : `T(c)·R(h)·diag(1, cos t)·R(−h)·T(−c)` → `{a,b,c,d,e,f}` ; `project(m, p)`, `unproject(m, p)`.
- `extrusion(plane, height)` : vecteur écran `−height·sin t·R(h)(0,1)` (positif = vers le haut de l'écran à orientation 0).
- `outlinePaths(child)` → `[{ points, closed }]` **ordonnés**, placés (rotation/flip comme `areaPath`) : ellipse/arc échantillonnés (`CURVE_SAMPLES`), polygone/étoile (déplacer `polygonVertices` ici, le renderer l'importe), rect, tracé, ligne (2 pts ouverts), point (1 pt).
- `silhouette(points, closed, v)` : sommets où le signe de `cross(arête, v)` change (+ extrémités si ouvert) → arêtes de flanc `p → p+v`.

## Rendu (`src/renderer-svg.js`)
- `render` : si `layer.plane`, chaque enfant reçoit la matrice ; `createNode` émet alors un `<path d>` depuis `outlinePaths` projetés (pas de `transform`, trait non écrasé). Attributs (tirets, opacité, contour double `hollowStroke`) inchangés → booléens et `areaPath` (recoupements creux) suivent via le même chemin projeté.
- Nouvelle `createExtrusion(child, matrix, v, sides)` quand `height ≠ 0` : face arrière (translatée par `v` si `height>0`, sinon la face d'origine est avant) + segments de silhouette (+ si `filled` : quads latéraux et faces dans un `<g opacity=EXTRUSION_TINT>` — `ponytail:` teinte fixe 0.35) → dans un `<g mask>` dont le masque noircit l'aire de la face avant ; face avant dessinée par-dessus.
  - `ponytail:` chaque forme = prisme plein ; trous (pair-impair, découpe booléenne) masqués comme du plein, et forme à booléens non extrudée — affiner le jour où un anneau le demande.
- Point extrudé = segment à bout rond (axe du 2e exemple).
- `childBounds` : projette les points + leur version extrudée → cadre de sélection/survol juste.
- Repères (`createGuides`) et poignées (`createHandles`) : `transform="matrix(…)"` sur leur groupe (déjà `non-scaling-stroke`).

## Pointeur (`src/ui/toolbar.js`)
- `toStagePoint` → si le calque actif a un plan, `unproject` : dessin, déplacement, sommets, pivots travaillent dans le repère du plan. Aimantation appliquée dans ce repère (`ponytail:` la grille affichée reste à plat).

## Persistance (`src/persistence.js`)
- `FORMAT = 'vektor/scene@23'`, `@22` ajouté à `READABLE_FORMATS` et à la liste non-legacy. Lecture : `plane` validé champ par champ (null si absent/invalide), `height` borné (`clampHeight`, défaut 0).

## UI (`src/ui/property-panel.js`)
- Réglages du calque : section « Plan 3D » — interrupteur (null ↔ défaut), scrubs Inclinaison / Orientation (`scrub.js`), sélecteur Flancs (Transparents / Colorés).
- Réglages de la forme : scrub « Hauteur Z », visible seulement si le calque de la forme a un plan.

## Suivi
- Ticket via `ovrsee-tickets` avant toute édition (hook bloquant). Commit : `feat: plan 3D isométrique des calques et hauteur des formes (format @23)`.
- `CLAUDE.md` : ligne Plan 3D dans Conventions du modèle.

## Vérification
- `test/core.test.js` : matrice identité à tilt 0 ; `unproject(project(p)) = p` ; vecteur d'extrusion ; `silhouette` d'un carré et d'une ellipse échantillonnée (2 arêtes) ; `setLayerPlane` immuable ; persistance @22 relue (plane null, height 0), @23 aller-retour, bornes.
- `test/render.test.js` : calque avec plan → `<path>` au lieu d'`<ellipse>` ; hauteur → masque + segments de flanc ; `filled` → groupe teinté ; export sans repères.
- `pnpm test` vert, puis `pnpm dev` : reproduire l'anneau (ellipse contour double, hauteur 20) + point extrudé en axe, vérifier dessin/déplacement au pointeur sur calque incliné.
