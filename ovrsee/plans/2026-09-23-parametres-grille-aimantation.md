---
{
  "status": "open",
  "title": "Paramètres : grille + aimantation",
  "opened": "2026-09-23",
  "closed": null,
  "commits": []
}
---

# Paramètres : grille + aimantation

## Contexte
Ajouter un bouton « Paramètres » dans la barre du haut. Il ouvre un panneau avec : case « Grille », champ « Divisions » (nombre de cases par côté). Grille active → elle s'affiche sur le stage et les points des formes s'aimantent à ses intersections.

Choix : la grille est une **préférence d'écran**, pas du dessin. Elle n'entre pas dans la scène : pas de bump de `FORMAT`, pas d'historique, pas d'export JSON/SVG. Elle est retenue dans le localStorage sous sa propre clé (`illu/settings`), `STORAGE_KEY` ne change pas.

## Étapes
0. Ovrsee : créer un ticket via le skill `ovrsee-tickets` et le passer en cours (le hook bloque les éditions sinon).

1. **`src/scene.js`** : fonction pure `snapToGrid(point, divisions)` à côté de `STAGE`.
   Cellule = `STAGE.width / divisions` (et `height` pour y), arrondi au plus proche. `divisions` falsy → point renvoyé tel quel.

2. **`src/ui/settings.js`** (nouveau) : `mountSettings({ svgRoot, container })`.
   - Bouton `⚙` (title/aria-label « Paramètres ») + panneau `popover` natif (`popovertarget`) : non modal, on voit la grille changer en direct. Échap et clic extérieur ferment d'eux-mêmes.
   - `<input type="checkbox">` Grille, `<input type="number" min=2 max=100>` Divisions (défaut 10), valeur bornée à la lecture.
   - Affichage : `svgRoot.toggleAttribute('data-grid', on)` + `svgRoot.style.setProperty('--grid-divisions', n)`.
   - Lecture/écriture de `illu/settings` dans un try/catch, valeurs revalidées au chargement.
   - Renvoie `{ snap: (point) => on ? snapToGrid(point, n) : point }`.

3. **`style.css`** : grille en CSS pur sur `#stage[data-grid]`, deux `linear-gradient` 1px, `background-size: calc(100% / var(--grid-divisions))`. Le fond d'un élément ne fait pas partie du DOM SVG, donc l'export ne l'embarque pas et rien ne change dans `renderer-svg.js` ; en pourcentage, la grille suit le zoom toute seule. Styles du panneau calqués sur `.shortcuts`.

4. **`src/ui/toolbar.js`** : `mountToolbar` reçoit `snap`. On y définit un `stagePoint = (event) => snap(toStagePoint(svgRoot, event))` et on remplace tous les appels à `toStagePoint`. Un seul point d'entrée couvre ainsi :
   - début et fin du dessin (`dragPatch` : centre et étendue pris sur la grille, extrémités de la ligne) ;
   - sommets du tracé posés au clic ;
   - glissement d'un sommet ;
   - déplacement d'une forme (le delta vaut un multiple de la cellule, donc une forme posée sur la grille y reste).

   `// ponytail:` : le déplacement aimante le delta, pas la position absolue, donc une forme posée hors grille garde son décalage. Même chose pour un sommet d'un tracé tourné, dont le delta passe par la rotation. Si ça gêne, aimanter la position finale à la place.

5. **`src/main.js`** : monter `mountSettings` dans `#toolbar-actions`, puis passer son `snap` à `mountToolbar`.

## Tests
- `test/core.test.js` : `snapToGrid` (arrondi au plus proche, divisions 10 → multiples de 90, point déjà sur la grille inchangé).
- `test/app.test.js` : cocher Grille pose `data-grid` sur `#stage`. Un pointerdown/up simulé hors grille crée une forme dont `x, y` sont des multiples de la cellule, si happy-dom sait gérer `getScreenCTM` ; sinon, seulement la vérification de l'attribut.

## Vérification
- `pnpm test`
- `pnpm dev` : activer la grille puis dessiner cercle, rect, ligne et tracé, vérifier que tout tombe sur les intersections. Changer les divisions, zoomer (la grille doit rester alignée), exporter en SVG (pas de grille dans le fichier), recharger la page (réglage conservé).
