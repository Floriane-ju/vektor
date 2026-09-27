---
{
  "status": "open",
  "title": "Onglets de dessins (Vektor 1, + Nouveau)",
  "opened": "2026-09-27",
  "closed": null,
  "commits": [
    {
      "sha": "afcc38c",
      "date": "2026-09-27",
      "files": [
        "CLAUDE.md",
        "index.html",
        "src/main.js",
        "src/persistence.js",
        "src/scene.js",
        "src/store.js",
        "src/ui/drawing-tabs.js",
        "src/ui/icons.js",
        "style.css",
        "test/app.test.js",
        "test/core.test.js",
        "test/drawing-tabs.test.js"
      ]
    }
  ]
}
---

# Onglets de dessins (Vektor 1, + Nouveau)

## Contexte
Une seule scène aujourd'hui (`illu:scene:v1`). Demande : barre d'onglets en pastille à droite du logo (principe de l'image : pastille sombre, onglet actif en clair, autres atténués, bouton « + Nouveau » à droite). Chaque onglet = un dessin indépendant (scène, historique, sauvegarde).

## Approche
Un seul store, une seule chaîne de rendu/panneaux : changer d'onglet = remplacer la scène du store et son historique. Pas de modification de `scene.js` ni du format (`@34` inchangé : le fichier JSON reste une scène).

### 1. `src/store.js` — échanger scène + historique
Ajouter `swap(next = { state, past: [], future: [] })` : renvoie `{ state, past, future }` courant, installe `next`, ferme un geste en cours (`gesture = null`), notifie. Historique par onglet gardé en mémoire (perdu au rechargement, comme aujourd'hui).

### 2. `src/persistence.js` — sauvegarde par dessin
- `saveLocal(scene, key = STORAGE_KEY)` / `loadLocal(key = STORAGE_KEY)` : clé en paramètre.
- `sceneKey(id)` : `D1` → `illu:scene:v1` (sauvegarde existante = « Vektor 1 », aucune migration), sinon `illu:scene:v1:<id>`.
- `DRAWINGS_KEY = 'illu/drawings'` : `{ tabs: [{ id, name }], active }`, lu validé/borné (noms `MAX_NAME_LENGTH`, ids `D\d+`), repli `{ tabs: [{ id: 'D1', name: 'Vektor 1' }], active: 'D1' }` ; `loadDrawings` / `saveDrawings`, try/catch comme le reste.
- `removeLocal(key)` pour la fermeture d'un onglet.

### 3. `src/ui/drawing-tabs.js` (nouveau) — `mountDrawingTabs({ store, container, status, onSwitch })`
- Pastille : un bouton par onglet (`role="tab"`, `aria-selected`), puis « + Nouveau ».
- Clic onglet : `autosave.flush()` (via `onSwitch`), `swap` vers la scène de l'onglet (en mémoire si déjà ouvert, sinon `loadLocal(sceneKey(id))`, `reserveIds`), `view.fit()`.
- « + Nouveau » : id `D<max+1>`, nom `Vektor <max+1>`, scène vierge `createScene()` (pas l'exemple), activé aussitôt.
- Renommer : double-clic → `inlineRename` de `ui/list.js`.
- Fermer : × au survol/focus de l'onglet, `confirm()` si le dessin a des formes ; dernier onglet non fermable ; supprime sa clé.
- Rouvre sur l'onglet actif sauvegardé.

### 4. `src/main.js`
- Scène initiale = `loadLocal(sceneKey(active))` (premier lancement : exemple comme aujourd'hui, seulement pour D1).
- L'autosave écrit dans `sceneKey(activeId)` courant (la clé est lue au moment d'écrire, `flush` avant tout changement d'onglet pour ne pas écrire un dessin dans la clé d'un autre).
- `savedLayers` recalé après `swap`.
- Monter `mountDrawingTabs` dans le nouveau conteneur.

### 5. `index.html` + `style.css`
- `<header class="topbar">` : `h1.brand` + `<nav class="float pill drawing-tabs" id="drawing-tabs" role="tablist">`. `.brand` quitte `position: fixed` pour le conteneur (même place : left 32, top 34 → aligner verticalement).
- Onglets : texte `--text-dim`, actif `--text` + fond léger, « + Nouveau » en bouton d'accent de la toolbar existante. Pastille = `.pill` existante. Vérifier qu'elle ne chevauche pas `panel-left` (`--gutter-top`) ; débord → `overflow-x: auto`.

## Fichiers
`src/store.js`, `src/persistence.js`, `src/ui/drawing-tabs.js` (nouveau), `src/main.js`, `index.html`, `style.css`, `CLAUDE.md` (une ligne : onglets + clés), ticket ovrsee.

## Vérification
- `test/core.test.js` ou nouveau test : `store.swap` (historique isolé, undo n'atteint pas l'autre dessin) ; `loadDrawings` repli/validation.
- `test/app.test.js` : ajouter `#drawing-tabs` au DOM ; clic « + Nouveau » → 2 onglets, scène vide ; retour sur onglet 1 → scène d'origine.
- `pnpm test`, puis `pnpm dev` : créer, dessiner, basculer, recharger (tout revient, onglet actif compris), renommer, fermer.

Choix par défaut (à corriger si besoin) : nouveau dessin vierge ; renommer + fermer inclus ; historique d'annulation par onglet non persistant ; export garde `vektor.svg`.
