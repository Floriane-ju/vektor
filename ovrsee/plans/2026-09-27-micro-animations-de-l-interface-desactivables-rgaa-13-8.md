---
{
  "status": "open",
  "title": "Micro-animations de l'interface, désactivables (RGAA 13.8)",
  "opened": "2026-09-27",
  "closed": null,
  "commits": [
    {
      "sha": "b6c042f",
      "date": "2026-09-27",
      "files": [
        "CLAUDE.md",
        "index.html",
        "src/main.js",
        "src/ui/boolean-section.js",
        "src/ui/drawing-tabs.js",
        "src/ui/interpolation-section.js",
        "src/ui/layer-panel.js",
        "src/ui/list.js",
        "src/ui/modifier-section.js",
        "src/ui/settings.js",
        "src/ui/shape-list.js",
        "style.css",
        "test/app.test.js",
        "test/drawing-tabs.test.js"
      ]
    }
  ]
}
---

# Micro-animations de l'interface, désactivables (RGAA 13.8)

## Contexte
L'interface n'a presque aucun mouvement (seuls `.switch::before` 0.12s et `.section-toggle .icon` 0.15s dans `style.css`). Les listes (onglets, arbre des calques, liste des formes) sont **entièrement reconstruites** à chaque notification (`rebuildWithFocus`, `draw()` des onglets) : une ligne ajoutée surgit sans transition, on ne voit pas où elle est apparue. But : des animations courtes et satisfaisantes sur les ajouts et ouvertures, **coupables** par l'utilisateur (RGAA 13.8, WCAG 2.3.3) et coupées par défaut si l'OS demande `prefers-reduced-motion`. Plan de travail SVG **hors périmètre** (choix validé : il est redessiné à chaque geste, et l'export clone son DOM).

## Approche

### 1. Interrupteur global — `src/ui/settings.js` + `style.css`
- Nouveau réglage `motion` dans le seau `illu/settings` : `true`/`false` si l'utilisateur a choisi, absent sinon. Effectif = `motion ?? !matchMedia('(prefers-reduced-motion: reduce)').matches` (écoute `change` de la media query tant que non choisi).
- `apply()` pose `document.documentElement.dataset.motion = 'on' | 'off'`.
- Case « Animations » dans le popover Paramètres (même `field()` que la grille), réutilise `update()`/`save()`.
- CSS, un seul verrou qui couvre aussi les transitions existantes :
  ```css
  :root[data-motion="off"] *, :root[data-motion="off"] *::before, :root[data-motion="off"] *::after {
    animation: none !important; transition: none !important;
  }
  ```
- Tokens `--ease-out: cubic-bezier(.2,.9,.3,1.2)` (léger dépassement), `--dur-fast: 120ms`, `--dur: 220ms` dans `:root`.

### 2. Détection des lignes nouvelles — `src/ui/list.js`
Un seul helper réutilisé par les trois listes :
```js
/** Marque `data-enter` les nœuds dont l'id n'était pas là au dessin précédent.
    Liste remplacée en entier (autre calque, autre dessin) : rien ne s'anime. */
export const entrance = () => { let seen = null; return (pairs /* [node, id][] */) => { … }; };
```
Règle : animer les ids absents de `seen`, sauf si `seen` non vide et qu'aucun id n'en subsiste (changement de contexte). Premier dessin : rien. Pose aussi `--enter-i` (rang parmi les entrants) pour un léger décalage quand plusieurs arrivent (duplication de sélection, annuler une suppression de groupe).

Branché dans :
- `src/ui/drawing-tabs.js` `draw()` — onglets (`tab.id`).
- `src/ui/layer-panel.js` builder de `rebuildWithFocus` — `layer-card` (`layer.id`).
- `src/ui/shape-list.js` builder — `layer-card` de forme (`element.id`), y compris sous-listes booléennes.

### 3. Animations CSS — `style.css`
| Où | Effet |
|---|---|
| `[data-enter]` ligne calque / forme | `row-in` : hauteur/opacité depuis 0 + `translateY(-4px)`, puis bref halo accent (`box-shadow` inset `--accent` qui s'éteint) — on voit *où* ça arrive |
| `.drawing-tab[data-enter]` | `tab-in` : `scale(.85)` + opacité, `--ease-out` |
| Popovers `.menu`, `.settings`, `.stroke-palette` | `@starting-style` + transition opacité/`translateY(-4px) scale(.98)` à l'ouverture (natif, sans JS) |
| `.status` | `status-in` rejoué à chaque message (dans `main.js` `status.show` : retirer/reposer l'attribut `data-enter` via `void node.offsetWidth`) |
| `.pill-btn`, `.icon-btn`, `.add-layer`, `.add-shape`, `.drawing-new` | `:active { transform: scale(.94) }` + transition `--dur-fast` |
| `.row-actions`, `.drawing-tab-close` | transition d'opacité au survol (aujourd'hui en tout-ou-rien) |
| `.icon-btn[aria-pressed]` (œil, cadenas, cube) | petit `pop` à la bascule : impossible par CSS seul car la ligne est recréée → même `entrance` inutile ; **sauté**, voir plus bas |

Durées ≤ 250 ms, aucune boucle, aucun clignotement (RGAA 13.7 sans objet).

### 4. Suivi ovrsee
Ticket via skill `ovrsee-tickets` avant toute édition (hook bloquant), puis mise à jour de `CLAUDE.md` (une ligne : `entrance` dans `ui/list.js`, `data-motion` + réglage `motion`).

## Sauté (ponytail)
- Animations de sortie (suppression) : la reconstruction retire le nœud tout de suite ; différer la suppression = toucher `rebuildWithFocus`. À ajouter si le manque se fait sentir.
- Pop des boutons œil/cadenas/cube : ligne recréée à chaque bascule.
- Hauteur animée des sections repliables.

## Fichiers
`style.css`, `src/ui/list.js`, `src/ui/settings.js`, `src/ui/drawing-tabs.js`, `src/ui/layer-panel.js`, `src/ui/shape-list.js`, `src/main.js` (statut), `test/app.test.js`, `CLAUDE.md`.

## Vérification
- `test/app.test.js` (happy-dom) : après `+ Ajouter un calque`, la nouvelle `.layer-card` porte `data-enter`, les anciennes non ; changer de calque actif → aucune ligne de forme `data-enter` ; case `#settings-motion` décochée → `html[data-motion="off"]` et réglage persistant dans `illu/settings`.
- `pnpm test` vert.
- `pnpm dev` + Chrome : ajouter dessin / calque / forme, dupliquer (⌘D), annuler une suppression, ouvrir Exporter/Paramètres ; puis décocher « Animations » et vérifier que tout est instantané ; activer « Réduire les animations » de macOS avec réglage non choisi → coupé par défaut.
