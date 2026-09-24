---
{
  "status": "open",
  "title": "Tickets issus du tour de code (2026-09-24)",
  "opened": "2026-09-24",
  "closed": null,
  "commits": [
    {
      "sha": "c789126",
      "date": "2026-09-24",
      "files": [
        "src/renderer-svg.js",
        "src/ui/toolbar.js",
        "test/app.test.js",
        "test/render.test.js"
      ]
    },
    {
      "sha": "5094ef9",
      "date": "2026-09-24",
      "files": []
    },
    {
      "sha": "3eddb11",
      "date": "2026-09-24",
      "files": []
    },
    {
      "sha": "67c29e1",
      "date": "2026-09-24",
      "files": [
        "src/ui/interpolation-section.js",
        "style.css"
      ]
    },
    {
      "sha": "ef41bdd",
      "date": "2026-09-24",
      "files": []
    },
    {
      "sha": "34fd7b7",
      "date": "2026-09-24",
      "files": [
        "CLAUDE.md",
        "src/interpolate.js",
        "src/path.js",
        "src/persistence.js",
        "src/renderer-svg.js",
        "src/scene.js",
        "src/ui/icons.js",
        "src/ui/layer-panel.js",
        "src/ui/list.js",
        "src/ui/property-panel.js",
        "src/ui/shape-list.js",
        "src/ui/shortcuts.js",
        "src/ui/toolbar.js",
        "style.css",
        "test/app.test.js",
        "test/core.test.js",
        "test/render.test.js",
        "test/scrub.test.js"
      ]
    }
  ]
}
---

# Tickets issus du tour de code (2026-09-24)

## Context
Demande : faire le tour du code (UX, features, code, perf) et en tirer des tickets. Trois audits en lecture seule (noyau/persistance, rendu/perf, UI) ont été faits, et les constats majeurs ont été revérifiés dans le code (`toSvgDocument` clone le `style` de la racine, `pointerdown` ignore `layer.visible`, autosave écrase une sauvegarde illisible, `fill-opacity`+`stroke-opacity` sur les formes remplies, `travel` remet `gesture = null`).
Livrable : **uniquement des fichiers `ovrsee/tickets/T-XXXX-*.md`** (aucun code touché). Format : skill `ovrsee-tickets` (frontmatter JSON, `cree`/`maj` = 2026-09-24, `plan: null`, colonne `backlog` sauf mention). Prochain id : **T-0056** (T-0030 est mort, ne pas reprendre). Chaque corps : `## Contexte` (fichier:ligne + effet) + `## Critères d'acceptation` constatables.

Exclus volontairement (déjà faits ou déjà ticketés) : undo/redo, duplication, raccourcis, export PNG, grille, booléens, rampes, compteur, miroir d'axe libre (T-0021), préréglages (T-0036). Écartés pour retenue : état vide/messages d'état, verrouillage/solo, panoramique Espace+glisser, cran aux jonctions booléennes, `MASK_REGION`.

## Tickets à créer (22 : 1 epic + 21)

### Nouvel epic — T-0056 « Robustesse des données » (haute, tags `epic`,`persistance`, `type: epic`)
Critère : aucun geste ni fichier ne peut faire perdre ou altérer en silence le travail.

| id | titre | prio | où / critère clé |
|---|---|---|---|
| T-0057 | Sauvegarde locale illisible écrasée au premier geste | haute | `main.js:25-35`, `persistence.js:383`. Sauvegarde illisible copiée sur une clé de secours avant tout autosave ; message propose de l'exporter. |
| T-0058 | Autosave : échec silencieux et dernier geste perdu à la fermeture | haute | `persistence.js:383-390, 424-430`. Quota plein → message d'erreur ; `flush` sur `pagehide` ; pas d'écriture sur sélection seule ; JSON non indenté pour l'autosave. |
| T-0059 | Tracé collé non borné par `MAX_POINTS` | haute | `path.js`, `scene.js:565`, `persistence.js:191`. Collage > MAX_POINTS refusé avec message ; `centerPoints` sans spread `Math.min(...)`. |
| T-0060 | Boucle de booléens : les deux formes disparaissent | moyenne | `boolean-section.js:33`, `scene.js:628`, `persistence.js:281`. Sélecteur exclut les formes qui créeraient un cycle ; import refuse les cycles. |
| T-0061 | Bornes à la saisie : plages, croissance spirale, champ vidé | moyenne | `scene.js:766`, `modifiers.js:86`, `persistence.js:101`, `property-panel.js:152`. Même clamp au panneau qu'à l'import ; croissance bornée (> -100 %, pas d'Infinity/NaN) ; `null`/`""` ≠ 0. |
| T-0062 | Annuler pendant un glisser casse le regroupement d'historique | moyenne | `store.js:47`. ⌘Z au milieu d'un geste → la suite du geste = un seul pas, `future` préservé. |

### Epic existant T-0026 « Rendu et style de trait » (`"epic": "T-0026"`)
| T-0063 | L'export embarque le style d'écran (zoom, grille, data-*) | haute | `renderer-svg.js:649`. Racine exportée sans `style` ni `data-*` ; SVG exporté à 800 % s'ouvre à 900 px ; grille absente du PNG. Bonus : pas de `data-element-id`/`pointer-events`/opacités à 1 dans le fichier. |
| T-0064 | Couleur de fond du plan, exportée | haute | `scene.js`, `renderer-svg.js:668`. Champ `background` dans la scène (option transparent), `<rect>` exporté SVG+PNG ; bump `FORMAT`. |
| T-0065 | Opacité interpolée : liseré sombre et aplats pair-impair figés | moyenne | `renderer-svg.js:387, 307`. Forme remplie → `opacity` sur le nœud ; aplat pair-impair suit la rampe. |
| T-0066 | Rendu incrémental : ne reconstruire que les calques changés | moyenne | `main.js:31`, `renderer-svg.js:22, 606`. Sélection seule → calques non recalculés ; couche d'écran séparée ; `getRenderedChildren` une fois par calque ; `union` sans spread. Test de non-régression. |
| T-0067 | Plafond sur les nœuds rendus, pas seulement les copies | moyenne | `scene.js:414`. Copies × formes > seuil → calque suspendu avec le même avertissement. |

### Epic existant T-0023 « Interpolations »
| T-0068 | Interpolation de couleur | moyenne | `interpolate.js:58`, `scene.js:40`. Deux couleurs, mélange le long des copies ; composition définie ; bump format. |

### Epic existant T-0012 « Géométrie des formes »
| T-0069 | Courbes dans les tracés collés (C, S, Q, T, A) | basse | `path.js:9`. Courbes échantillonnées en sommets ; chemin exporté d'Illustrator/Figma accepté. |

### Epic existant T-0032 « Flux de travail »
| T-0070 | Dessiner sur un calque masqué crée une forme invisible | haute | `toolbar.js:450`. Calque masqué → calque réaffiché (ou geste refusé avec message). |
| T-0071 | Clavier des listes : Suppr/Retour et flèches visent la mauvaise cible | haute | `layer-panel.js:133`, `shape-list.js:155`, `shortcuts.js:39,118`. Backspace supprime la ligne qui a le focus ; ↑/↓ sur une ligne naviguent au lieu de déplacer la forme. |
| T-0072 | Renommage en ligne, et formes nommables | moyenne | `layer-panel.js:124`, `list.js:86`. Champ en place (double-clic ou F2) au lieu de `prompt()` ; `element.name` optionnel, libellé stable au réordonnancement ; bump format. |
| T-0073 | Réordonner au glisser et changer une forme de calque | moyenne | `layer-panel.js:151`, `shape-list.js:172`, `scene.js:659`. Glisser-déposer dans l'arbre ; transition `moveElementToLayer` (booléens nettoyés). |
| T-0074 | Multi-sélection, lasso et poignées de transformation | moyenne | **colonne `a-specifier`** : modèle `activeElementId` unique ; questions ouvertes (glisser dans le vide = lasso ou déplacer ? poignées sur copie source seulement ?). |
| T-0075 | Interface sur petits écrans | basse | **colonne `a-specifier`** : `style.css` sans `@media`, gouttières fixes 336/360 px. À trancher : panneaux repliables vs tiroirs ; seuil. |

### Code (sans epic)
| T-0076 | Découper `property-panel.js` et `toolbar.js`, briques de formulaire partagées | basse | `mountPropertyPanel` ~627 l., `mountToolbar` ~395 l. ; `ui/controls.js` unique (option/select/field/addButton/segmented), menu export extrait ; tests verts, aucun changement visible. |
| T-0077 | Versions de format lisibles dérivées d'un numéro | basse | `persistence.js:57-77, 361`. Une seule liste/comparaison de version ; `reserveIds` appelé une fois ; ids d'interpolation dupliqués refusés à l'import ; `removeLayer` recopie `...scene`. |

## Exécution
1. Relire un ticket existant (ex. `T-0021`) pour caler le style du corps.
2. Écrire les 22 fichiers T-0056 → T-0077, slug = titre sans accents, `[^a-z0-9]`→`-`, ≤ 60 car.
3. Pas de commit sauf demande (Conventional Commits FR : `chore: ajouter les tickets du tour de code`).

## Vérification
- `ls ovrsee/tickets | tail -22` : T-0056…T-0077 présents, aucun id repris.
- `node -e` sur chaque frontmatter : JSON valide, `colonne` ∈ board.json, `priorite` ∈ {haute,moyenne,basse}, `epic` pointe un ticket `type: epic`.
