---
{
  "status": "open",
  "title": "Audit front — tickets ovrsee (aucun code modifié)",
  "opened": "2026-09-28",
  "closed": null,
  "commits": [
    {
      "sha": "20ce404",
      "date": "2026-09-28",
      "files": [
        "style.css",
        "test/style.test.js"
      ]
    },
    {
      "sha": "0eb676b",
      "date": "2026-09-28",
      "files": [
        "src/renderer-svg.js",
        "src/ui/gestures.js",
        "src/ui/settings.js",
        "src/ui/stroke-card.js",
        "style.css",
        "test/render.test.js"
      ]
    },
    {
      "sha": "3edefb8",
      "date": "2026-09-28",
      "files": [
        "src/persistence.js",
        "test/core.test.js"
      ]
    },
    {
      "sha": "cb4b8ba",
      "date": "2026-09-28",
      "files": [
        "src/path.js",
        "src/scene.js",
        "test/core.test.js"
      ]
    },
    {
      "sha": "28b507d",
      "date": "2026-09-28",
      "files": [
        "src/interpolate.js",
        "src/modifiers.js",
        "src/renderer-svg.js",
        "src/scene.js",
        "src/ui/fields.js",
        "src/ui/list.js",
        "src/ui/zoom.js",
        "style.css",
        "test/core.test.js"
      ]
    },
    {
      "sha": "4804ac6",
      "date": "2026-09-28",
      "files": [
        "src/ui/drawing-tabs.js",
        "src/ui/export-menu.js",
        "src/ui/list.js",
        "test/drawing-tabs.test.js"
      ]
    },
    {
      "sha": "243acb4",
      "date": "2026-09-28",
      "files": [
        "style.css",
        "test/style.test.js"
      ]
    },
    {
      "sha": "b785d46",
      "date": "2026-09-28",
      "files": [
        "style.css",
        "test/style.test.js"
      ]
    },
    {
      "sha": "4e0b3dd",
      "date": "2026-09-28",
      "files": [
        "src/ui/toolbar.js",
        "style.css",
        "test/style.test.js"
      ]
    }
  ]
}
---

# Audit front — tickets ovrsee (aucun code modifié)

## Contexte

Audit demandé : design system, harmonisation, code mort, structure. Contrainte : ne rien corriger, seulement créer les tickets. Trois explorations (CSS/tokens, code mort, harmonisation/structure) faites ; constats clés revérifiés à la main (`row-glow` sans `@keyframes`, `.field-label` orphelin, `parseDash` mort hors tests, `var()` dans un attribut SVG, ids calque/forme non croisés à l'import).

Design system existant : tokens `:root` de `style.css:4-42` (couleurs, rayons, 5 tailles de police, gouttières, easing/durées). **Absents** : espacement, hauteurs de contrôle, graisses, bordures, opacités, z-index. Pas de couleur brute dans `style.css` hors `:root` ; les fuites sont côté JS (chrome SVG).

## Exécution

Écrire directement dans `ovrsee/tickets/` (format du skill `ovrsee-tickets`, frontmatter JSON, colonne `backlog`, `cree`/`maj` = 2026-09-28, `plan: null`). Prochain id : **T-0127**. Tous rattachés à l'epic T-0127 sauf T-0137 (epic existant T-0056 « Robustesse des données »). Plus : **compléter T-0059** (déjà ouvert, même sujet) au lieu d'un doublon.

Sévérité : bloquant = `haute`, mineur = `moyenne`/`basse`.

### Epic
- **T-0127** `audit-front-design-system-harmonisation-code-mort` — type epic, moyenne, tags `audit`. Critère : tous les enfants soldés ; `grep -E '#[0-9a-f]{6}'` dans `src/ui` + `renderer-svg.js` ne renvoie que des données de scène / masques.

### Design system
- **T-0128** [haute, bug] `@keyframes row-glow` absente — `style.css:800`, `:844` (jamais définie, `git log -S`). Lueur des lignes apparues jamais jouée. Correctif : définir la keyframe (ou la retirer des deux listes). Critère : animation visible à l'ajout d'une ligne, rien si `data-motion="off"`.
- **T-0129** [haute] Couleurs et traits du chrome SVG codés en dur — `renderer-svg.js:223-225` (`#1b1b1b`/`#ee4722` poignées), `:930-932` (`var(--accent, #ee4722)` en **attribut de présentation**, que le commentaire `:745` dit non lu → cadre de transformation peut-être sans trait, à vérifier Chromium + Firefox), `:335-338` (`#a2a8b4` sans token), `:748-752` `FRAME_COLORS` (3× même valeur + repli hex), `:848-853`, `gestures.js:233,361` (dash `4 4`), `settings.js:177` (`'#303030'` copie `--grid`), `stroke-card.js:19-20` (`PALETTE` copie `--accent`/`--text`). Correctif : `el.style.fill/stroke = 'var(--…)'` comme `:852`, token `--guide`, constantes de trait regroupées. Critère : poignées/cadre suivent un changement de `--accent` ; export SVG inchangé (repères retirés).
- **T-0130** [moyenne] Échelle d'espacement et hauteurs de contrôle — aucun token : gap/padding 2/4/6/8/10/12/14/16/24 px (~50 occurrences ; `10px` hors échelle `:175,:314,:702`, `14px` `:224,:256`, `30px` `:577`), hauteurs 36/40/28/24/44 px, décalage flottant `24px` ×7, largeurs panneaux `288px` `:307` / `312px` `:312` non reliées aux gouttières (336 = 288+48). Correctif : `--space-1…6`, `--control-h`, `--control-h-sm`, `--row-h`, `--float-inset`, gouttières dérivées des largeurs de panneau. Critère : plus de px d'espacement bruts hors `:root` ; rendu identique (capture avant/après).
- **T-0131** [basse] Tokens de mouvement, d'état et de typo — durées brutes `0.12s` `:566`, `0.15s` `:516`, `220ms` `:878-879` (= `--dur`), `240/280/300ms`, stagger `40ms` ; `scale(0.96/0.97/0.92/0.88)` ; opacités 0.35–0.8 ; `1.5px` ×8 (`--hairline`) ; anneau focus `2px solid var(--select)` ×4 ; `color-mix(…accent 30%…)` ×2 (`--accent-tint`) ; graisses 500/600 brutes ; `z-index: 1` ×3. Critère : ces valeurs n'apparaissent plus qu'une fois, dans `:root`.

### Harmonisation
- **T-0132** [moyenne] CSS dupliqué — `.shape-picker legend` `:277-283` recopie `.visually-hidden` `:55` ; input natif masqué ×3 (`:257,:284,:585`) ; focus ×3 (`:259,:296,:587`) ; surfaces flottantes `.stroke-palette`/`.menu,.settings`/`.shortcuts` (`:657,:712,:739`) ; police de titre ×5 (`:308,:504,:669,:734,:748`) ; `.slider-head` = `.section-head` (`:486`/`:503`) ; `[hidden]{display:none}` rustiné ×5 ; `!important` évitables `:488-490` (`input.range-value`), `:634` (`input.hex`) ; règle redondante `:125`. Critère : une règle par motif, plus de `!important` hors coupe-mouvement `:778-779`.
- **T-0133** [basse] Conventions d'état et nommage des classes — états mêlés : `is-*`, `data-x="true"/"false"`, `data-x` de présence, ARIA. `data-selected` = `layer`/`parent` (`layer-panel.js:183`) vs `true` (`shape-list.js:161`). `.layer-card/.layer-row/.layer-name` stylent aussi les formes, `.layer-name-input` les onglets. `.swatches` vs `.swatch-list` (`stroke-card.js:71,104`). Correctif : règle écrite (ARIA pour l'a11y, `data-*` présence pour l'état, `is-*` variantes fixes) ajoutée à CLAUDE.md, renommages. Critère : `data-selected` un seul sens ; convention documentée.
- **T-0134** [moyenne] Contrôles DOM réinventés hors `ui/fields.js` (CLAUDE.md le dit seul module du genre) — bouton pilule ×6 (`history.js:14`, `zoom.js:12`, `settings.js:264`, `shortcuts.js:80,86`, `export-menu.js:137`, `drawing-tabs.js:113`) ; `settings.js:150` redéfinit `field`, `:158` `numberInput`, `:189-209` input/select à la main ; `drawing-tabs.js:116-121` refait `rebuildWithFocus` (`list.js`) sans cascade de repli ; cycle d'import `fields.js:5` ↔ `settings.js:2`. Critère : `pillButton` unique dans `fields.js` ; `drawing-tabs` passe par `rebuildWithFocus` ; plus de cycle.
- **T-0135** [moyenne] Géométrie et helpers SVG dupliqués — `svgNode` (`renderer-svg.js:658`) contourné par `createElementNS`+`setAttribute` (`:38,:221,:330,:347,:894,:928`, `gestures.js:227,:355`), `guideNode` `:242` quasi-doublon ; `outlinePoints` `:758` ≈ `plane.js:79 outlinePath` (+ `CURVE_SAMPLES` ×2) ; retournement+rotation ×3 (`plane.js:86`, `renderer-svg.js:412,:805`) ; deg→rad ×5 dont `degrees` `:756` mal nommé (renvoie des radians) ; boîte englobante ×5 ; `extrusion(child.plane, …)` ×3 ; `Math.min(max, Math.max(min, …))` ~15× sans `clamp` ; epsilons inline vs `EPSILON` ; `round`/`lerp` homonymes à sens différents. Critère : un helper par opération, exporté de `plane.js` / `scene.js` ; `pnpm test` vert.

### Code mort
- **T-0136** [basse] Code et styles orphelins — `parseDash` `scene.js:292` (tests seuls, `core.test.js:1502-1509`) ; `.field-label` `style.css:477` (0 usage) ; `export` superflus sur 13 noms internes (`noise`, `lerp`, `GROWTH_BOUNDS`, `polygonPoints`, `arcPath`, `projectedPath`, `MAX_SIDES`, `MAX_HEIGHT`, `centerPoints`, `DEFAULT_LINECAP`, `DEFAULT_BOOLEAN_OP`, `nextId`, `restoreFocus`, `clampZoom`) ; commentaire de `rotateVector` égaré `scene.js:218` (fonction `:235`). Critère : `parseDash` et son test retirés, `.field-label` retiré, exports réduits, `pnpm test` + `pnpm build` verts.

### Structure / erreurs
- **T-0137** [haute, epic T-0056] Ids calque/forme non croisés à l'import — `persistence.js:479-486` vérifie calques et formes séparément ; un calque `E1` + une forme `E1` → `mapOwner` (`scene.js:1158`) route les piles de la forme vers le calque. Format d'id non validé, nombre de calques/formes/étages non borné, nom de calque non tronqué (`readLayer` `:444`, contrairement à `readName`), ids d'interpolation non dédoublonnés. Critère : fichier à ids croisés refusé avec message clair ; test dans `persistence.test.js`.
- **Compléter T-0059** : ajouter `parsePoints` (`path.js:77`) — ni `MAX_POINTS` ni `Number.isFinite` (`1e999` → `Infinity`), nombre de sous-chemins de `parseD` non borné. Nouveaux critères + `maj`.
- **T-0138** [basse] Erreurs avalées ou mal libellées — `list.js:96` `.catch(() => {})` sans commentaire ; `export-menu.js:61` toute erreur de `toPng` affichée « presse-papier refusé » ; `drawing-tabs.js:25` ignore le `false` de `saveDrawings` ; `drawing-tabs.js:64` déstructure un `find` sans garde. Critère : échec d'écriture des onglets signalé à l'écran ; message PNG distingue rendu et presse-papier.
- **T-0139** [basse] Fichiers et fonctions trop longs — `scene.js` 1275 l., `renderer-svg.js` 1089 l. (> 800) ; fonctions > 80 l. : `mountSettings` 114, `mountDrawingTabs` 112, `parseD` 111, `createNode` 93, `drawLayer` 85, `mountLayerPanel` 84 ; imbrication 6 `layer-panel.js:280-287`. Correctif : sortir de `renderer-svg.js` le chrome d'écran (≈215-360, 840-1006) et les boîtes (750-875) ; de `scene.js` les bornes/constantes. Critère : aucun fichier `src/` > 800 lignes, CLAUDE.md à jour.

Non ticketé (retenue) : JSDoc/`@typedef` absents (pas de TS, choix du projet) ; mélange `mount*`/`create*`/`draw*` jugé cosmétique ; classes JS sans règle CSS (`slider-field`, `section-title`, `stroke-card`) = crochets inoffensifs.

## Vérification

- Chaque fichier ticket : frontmatter JSON valide (`python3 -c 'json.loads(...)'` sur tous), `colonne` ∈ `board.json`, `priorite` ∈ {haute, moyenne, basse}, enfants avec `"epic"` existant.
- `git status` : seuls `ovrsee/tickets/*` touchés (12 nouveaux + T-0059 modifié), aucun fichier de code.
