---
{
  "status": "open",
  "title": "Outil d'illustration vectorielle générative",
  "opened": "2026-09-22",
  "closed": null,
  "commits": [
    {
      "sha": "e048436",
      "date": "2026-09-22",
      "files": []
    }
  ]
}
---

# Outil d'illustration vectorielle générative

## Context

Projet greenfield dans `/Users/floriane/Documents/illu` (repo git vide, aucun commit).
Seul contenu existant : `ovrsee.config.json` (`pnpm dev`, `http://localhost:5173`) et `ovrsee/board.json` — donc **Vite** est attendu comme dev server.

Besoin : un éditeur 2D par calques qui compose des illustrations vectorielles façon « Retro Futuristic Elements » — une forme de base par calque, dupliquée par un modificateur procédural (miroir, miroir axial, spirale), avec interpolation de propriétés (opacité, échelle) sur les enfants générés. Sortie : SVG vectoriel + sauvegarde/chargement JSON.

Trois décisions validées avec l'utilisateur, qui écartent la partie la plus risquée du brief initial :

1. **Rendu SVG DOM unique** (pas de p5.js). Le brief proposait p5.js canvas pour le preview + un sérialiseur SVG séparé pour l'export — deux renderers à garder en phase, et le brief listait lui-même la divergence canvas/SVG comme risque. En rendant directement dans un `<svg>` du DOM, le preview **est** le vectoriel et l'export est `svg.outerHTML`. Un seul renderer, zéro dépendance de rendu, le risque disparaît par construction.
2. **Vanilla JS + Vite**, état réactif maison.
3. **Un modificateur par calque** en v1 (champ `modifier`, pas `modifiers[]`). Chaîner = empiler deux calques.

Conséquence : les fichiers `renderer-canvas.js` et `main.js`(boucle p5) du brief disparaissent, ainsi que la mémoïsation de `getRenderedChildren()` — il n'y a plus de boucle `draw()` 60fps, le re-render n'arrive que sur changement d'état.

## Arborescence cible

```
index.html            # layout: panneau calques | <svg> | panneau propriétés
style.css             # thème sombre monochrome
package.json          # devDeps: vite, vitest
src/
  main.js             # bootstrap: crée le store, monte les panneaux, abonne le renderer
  store.js            # état + subscribe/notify (~30 lignes)
  scene.js            # fabriques Layer/Element, getRenderedChildren()
  modifiers.js        # mirrorH, mirrorV, axial, spiral -> tableaux d'enfants
  interpolate.js      # lerp indexé par propriété
  renderer-svg.js     # scene graph -> nœuds SVG (preview + export)
  persistence.js      # JSON localStorage + import/export fichier
  ui/
    toolbar.js
    layer-panel.js
    property-panel.js
test/
  core.test.js        # interpolate + modifiers (les deux pièces testées par les critères d'acceptation)
```

## Modèle de données (`src/scene.js`)

```js
Element = { type: 'circle', x, y, radius, fill, stroke, strokeWidth }
Layer = {
  id, name, visible: true,
  center: { x, y },                       // pivot des modificateurs axial/spirale
  baseElement: Element | null,
  modifier: { type: 'none'|'mirrorH'|'mirrorV'|'axial'|'spiral', n, angleStep, radiusStep },
  propertyRanges: { opacity: [1, 1], scale: [1, 1] }
}
Scene = { layers: [], activeLayerId }
```

Mises à jour **immuables** : chaque action renvoie une nouvelle `Scene` ; le store remplace la référence et notifie. L'ordre du tableau `layers` = z-order (index 0 = fond).

## Modificateurs (`src/modifiers.js`)

Chaque fonction est pure : `(element, n, center, opts) -> Element[]` de longueur `n`, position/rotation seules.

- `mirrorH(el, n, center)` — l'enfant `i` a `x = lerp(el.x, 2*center.x - el.x, t(i))`, `y` inchangé. `n=2` ⇒ le miroir classique (base + reflet) ; `n=5` ⇒ 5 copies réparties sur l'axe, ce qu'exige le critère d'acceptation « miroir à 5 éléments ».
- `mirrorV(el, n, center)` — idem sur `y`.
- `axial(el, n, center)` — l'enfant `i` est la rotation de `el` de `i * 2π/n` autour de `center`. `n=6` ⇒ 6 copies à 60°, également espacées.
- `spiral(el, n, center, { angleStep, radiusStep })` — soit `(r0, θ0)` les coordonnées polaires de `el` autour de `center` ; l'enfant `i` est à `(r0 + i*radiusStep, θ0 + i*angleStep)`.
- `none` ⇒ `[el]`.

`t(i) = n <= 1 ? 0 : i / (n - 1)` — facteur partagé avec l'interpolation, **défini une seule fois** dans `interpolate.js` et importé ici, pour que position et propriétés utilisent exactement la même rampe.

Garde de dégénérescence : `n` est clampé à `Math.max(1, Math.floor(n))` à l'entrée de chaque modificateur ; `n=1` ⇒ un seul enfant, à la valeur de départ (pas de division par zéro).

## Interpolation (`src/interpolate.js`)

```js
export const t = (i, n) => (n <= 1 ? 0 : i / (n - 1));
export const lerp = (a, b, f) => a + (b - a) * f;
export const interpolateProps = (ranges, i, n) =>
  Object.fromEntries(
    Object.entries(ranges).map(([k, [from, to]]) => [k, lerp(from, to, t(i, n))])
  );
```

Générique sur le nom de propriété : ajouter `rotation` ou une couleur plus tard = ajouter une entrée dans `propertyRanges` (une couleur demandera une variante `lerpColor`, le reste ne bouge pas).

Vérifie le critère : `opacity: [1, 0]`, `n=5` ⇒ `1, 0.75, 0.5, 0.25, 0`.

## Composition (`Layer.getRenderedChildren()` dans `scene.js`)

```js
const children = MODIFIERS[layer.modifier.type](layer.baseElement, n, layer.center, layer.modifier);
return children.map((child, i) => ({ ...child, ...interpolateProps(layer.propertyRanges, i, n) }));
```

Une seule passe, transform positionnel puis propriétés interpolées. Pas de mémoïsation : appelé uniquement au re-render déclenché par le store, pas à chaque frame.

## Renderer (`src/renderer-svg.js`)

```js
render(scene, svgRoot)  // vide svgRoot, réémet un <g> par calque visible
```

- Un `<g data-layer-id>` par calque visible, dans l'ordre du tableau ⇒ z-order.
- Un `<circle cx cy r fill stroke stroke-width fill-opacity stroke-opacity>` par enfant ; `scale` multiplie `radius`, `opacity` alimente `fill-opacity` **et** `stroke-opacity`.
- Export : `new XMLSerializer().serializeToString(svgRoot)`, préfixé de `<?xml version="1.0"?>`, avec `xmlns="http://www.w3.org/2000/svg"` et `width`/`height`/`viewBox` sur la racine. Téléchargement via `Blob` + `URL.createObjectURL` + `<a download>`.

Le preview et l'export sortent du même nœud ⇒ identiques par construction, pas de spot-check à faire.

## UI

- `index.html` — grille CSS trois colonnes (240px | 1fr | 280px), `<svg id="stage">` au centre. Thème sombre monochrome ; contraste texte ≥ 4.5:1 (WCAG AA).
- `toolbar.js` — clic sur le `<svg>` ⇒ place/déplace `baseElement` du calque actif aux coordonnées du clic (converties via `getBoundingClientRect`). Champs radius / fill / stroke / strokeWidth. Boutons « Export SVG », « Exporter JSON », « Importer JSON ». État vide : texte d'aide « Cliquer pour ajouter une forme ».
- `layer-panel.js` — liste, ajout, suppression (avec état de confirmation, déclenchable aussi par la touche Suppr), réordonnancement par boutons ↑/↓ (plus simple et plus accessible que le drag, le brief acceptait les deux), case de visibilité, sélection du calque actif.
- `property-panel.js` — sélecteur de type de modificateur, input `n` (min 1), `angleStep`/`radiusStep` visibles seulement pour `spiral`, sliders début/fin pour `opacity` et `scale`. Désactivé (`disabled` + `aria-disabled`) si aucun calque actif. Chaque `input` émet directement une action de store — pas de bouton « Appliquer ».
- Accessibilité : tous les contrôles atteignables au clavier, `aria-label` sur les boutons icône, `aria-pressed` sur la bascule de visibilité.

## Persistance (`src/persistence.js`)

`serialize(scene) -> JSON`, `deserialize(json) -> Scene` avec validation d'entrée (le JSON importé est une donnée externe : vérifier la forme, clamper `n`, rejeter proprement avec un message d'erreur visible plutôt que de laisser passer un objet malformé). Autosave dans `localStorage` sur chaque notification du store (throttlé), restauration au démarrage. Export/import fichier `.json`.

## Vérification

```bash
pnpm install          # devDeps vite + vitest — à valider avant lancement
pnpm dev              # http://localhost:5173
pnpm test             # test/core.test.js
```

`test/core.test.js` couvre les deux pièces que les critères d'acceptation testent précisément :

- `interpolateProps({ opacity: [1, 0] }, i, 5)` pour `i=0..4` ⇒ `1, 0.75, 0.5, 0.25, 0`.
- `axial(el, 6, center)` ⇒ 6 enfants, angles espacés de 60°, tous à distance constante du centre.
- `t(0, 1) === 0` — garde du cas dégénéré, aucun `NaN`.

Vérification manuelle dans le navigateur (`/run` ou Chrome MCP) :

1. Cliquer sur le stage avec un calque actif ⇒ un cercle apparaît et figure dans le scene graph.
2. Modificateur `axial`, `n=6` ⇒ 6 copies visuellement distinctes et régulièrement réparties.
3. Opacité 100 % → 0 %, miroir `n=5` ⇒ inspecter le DOM : `fill-opacity` = 1 / 0.75 / 0.5 / 0.25 / 0.
4. « Export SVG » ⇒ fichier téléchargé, même nombre de `<circle>` et mêmes positions que le preview.
5. Réordonner deux calques ⇒ z-order mis à jour immédiatement, sans rechargement.
6. Exporter en JSON, recharger la page, réimporter ⇒ scene graph identique.

## Points à confirmer avant `pnpm install`

Ajout de deux devDeps : **vite** et **vitest**. Aucune dépendance runtime.

## Hors périmètre v1

Dessin de chemins/béziers, formes autres que le cercle, chaînage de modificateurs, undo/redo, export AI/EPS, collaboration, layout mobile (desktop ≥ 1280px).
