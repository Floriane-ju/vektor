---
{
  "status": "open",
  "title": "Icônes Material Symbols (Rounded, graisse 100)",
  "opened": "2026-09-29",
  "closed": null,
  "commits": [
    {
      "sha": "e63a088",
      "date": "2026-09-29",
      "files": [
        "CLAUDE.md",
        "public/fonts/general-sans.ttf",
        "public/fonts/material-symbols-rounded.ttf",
        "src/ui/boolean-section.js",
        "src/ui/drawing-tabs.js",
        "src/ui/export-menu.js",
        "src/ui/fields.js",
        "src/ui/icons.js",
        "src/ui/interpolation-section.js",
        "src/ui/layer-panel.js",
        "src/ui/list.js",
        "src/ui/modifier-section.js",
        "src/ui/settings.js",
        "src/ui/shape-list.js",
        "src/ui/shortcuts.js",
        "src/ui/stroke-card.js",
        "src/ui/zoom.js",
        "style.css",
        "test/style.test.js"
      ]
    },
    {
      "sha": "eb7362c",
      "date": "2026-09-29",
      "files": []
    }
  ]
}
---

# Icônes Material Symbols (Rounded, graisse 100)

## Contexte
Floriane a posé `MaterialSymbolsRounded-VariableFont_FILL,GRAD,opsz,wght.ttf` à la racine. Remplacer toutes les icônes de l'interface par cette typo (graisse 100), sauf celles sur mesure. Arbitré : **pictos des outils de forme (arc, ellipse, polygon, rect, line, point, polyline) et aperçus de la liste des formes restent en SVG**. Interdire désormais les icônes ASCII/Unicode dans `CLAUDE.md`.

## Étapes

0. **Suivi** : ticket via skill `ovrsee-tickets` (hook bloque sinon), passé en cours.

1. **Police** : `mv` le TTF vers `public/fonts/material-symbols-rounded.ttf` (virgules dans le nom = URL fragile ; `public/` servi tel quel par Vite, copié dans `dist/`).

2. **`style.css`**
   - `@font-face { font-family: 'Material Symbols Rounded'; src: url('/fonts/material-symbols-rounded.ttf') format('truetype'); font-weight: 100 700; font-display: block; }` (`block` : pas de flash du nom de ligature).
   - Token `:root` : `--weight-icon: 100` (test `style.test.js` interdit `font-weight: N00` brut hors `:root`).
   - `.icon.is-symbol { font-family: 'Material Symbols Rounded'; font-weight: var(--weight-icon); font-variation-settings: 'FILL' 0, 'GRAD' 0, 'opsz' 20; font-size: var(--icon-size); line-height: 1; font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased; user-select: none; }`
   - Ajuster ce qui visait `svg` dans `.icon` si besoin (`.section-toggle .icon` rotation : inchangé, span).

3. **`src/ui/icons.js`**
   - `PATHS` réduit aux SVG sur mesure : `arc, ellipse, polygon, rect, line, point, polyline`.
   - Table `SYMBOLS` nom interne → ligature Material :
     `cursor→arrow_selector_tool`, `grid→grid_on`, `eye→visibility`, `eyeOff→visibility_off`, `cube→view_in_ar`, `cubeOff→view_in_ar_off`, `lock→lock`, `lockOff→lock_open`, `warning→warning`, `chevronDown→expand_more`, `chevronRight→chevron_right`, `grip→drag_indicator`, `plus→add`, `minus→remove`, `close→close`, `up→arrow_upward`, `down→arrow_downward`, `duplicate→content_copy`, `settings→settings`, `help→help`.
   - `icon(name, size)` : si `name` dans `PATHS` → SVG comme aujourd'hui ; sinon `<span class="icon is-symbol" aria-hidden="true" style="--icon-size:{size}px">{ligature}</span>`. Même signature → appels existants (`layer-panel`, `shape-list`, `fields`, `drawing-tabs`, `export-menu`, `settings`, `list.js` grip, `toolbar` cursor) inchangés.

4. **Glyphes texte → `icon()`**
   - `iconButton` (`ui/list.js`) : param `text` remplacé par `icon` (nom) → `node.append(icon(name, ICON_SIZE.sm))`. Appels : `×`→`close` (`boolean-section`, `interpolation-section`, `modifier-section`, `layer-panel`, `shape-list`), `↑/↓`→`up/down` (`modifier-section`), `⧉`→`duplicate` (`layer-panel`, `shape-list`). Les boutons œil/cadenas/cube qui passent `text: ''` puis `append(icon)` → passent `icon:` directement.
   - `settings.js:219` `'⚙'`→`icon('settings')` ; `shortcuts.js:86` `'?'`→`icon('help')` ; `zoom.js:21-23` `−/+`→`icon('minus'|'plus')` (garder `is-square` : adapter la condition `text.length === 1`) ; `stroke-card.js:87` swatch `'+'`→`icon('plus')`.
   - « + Ajouter… » (`fields.js:151 addButtonFor`, `interpolation-section.js:179`, `layer-panel.js:266`, `shape-list.js:206`) → `icon('plus')` + texte « Ajouter… ».
   - Hors périmètre : `×` dans « 1024 × 1024 », `…` des libellés de menu, flèches dans `title`/raccourcis (texte, pas icônes).

5. **`CLAUDE.md`** (section conventions UI, `style.css`/`src/ui/*`) : « **Icônes : typo Material Symbols Rounded obligatoire** (`public/fonts/`, graisse 100, via `icon(name)` de `ui/icons.js`, table `SYMBOLS`). **Interdit** : icône en ASCII/Unicode (`×`, `+`, `↑`, `⚙`, `⧉`…) ou nouveau SVG maison — seuls sur mesure : pictos des outils de forme et aperçus de la liste des formes. »

## Vérification
- `pnpm test` (style.test : pas de graisse brute ; app/render : clics `.icon-btn.is-danger` inchangés).
- `pnpm build` : TTF présent dans `dist/fonts/`.
- `pnpm dev` + Chrome (skill `run`/claude-in-chrome) : capture barre du bas, arbre (œil, cadenas, cube, dupliquer, supprimer, grip, chevrons), piles (↑↓×), zoom, paramètres, aide, nuancier ; vérifier graisse 100 et absence de nom de ligature en clair. Contrôle Firefox si dispo.

## Note
TTF = 15 Mo (tous axes, tous glyphes). Sous-ensemble possible plus tard (`pyftsubset`, dépendance à installer → demander) si le chargement pèse.
