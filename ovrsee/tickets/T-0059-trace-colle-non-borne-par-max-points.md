---
{
  "id": "T-0059",
  "titre": "Tracé collé non borné par MAX_POINTS",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "xs",
  "tags": [
    "persistance",
    "formes"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-28",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

L'import refuse un tracé de plus de `MAX_POINTS` sommets (`persistence.js:191`),
mais le collage (`path.js`, `addTraces` dans `scene.js:565`) ne borne rien. Un
chemin de 6000 sommets se colle sans erreur… et l'autosave comme l'export
deviennent illisibles au rechargement (ce qui mène à T-0057). Au-delà de
~100 000 sommets, `centerPoints` (`Math.min(...xs)`, `scene.js:169`) lève un
`RangeError`.

Audit du 2026-09-28 : `parseD` borne les sommets par sous-chemin (`path.js:191`),
mais `parsePoints` ne borne rien et ne rejette pas les coordonnées infinies, et le nombre
de sous-chemins n'a pas de plafond.

## Critères d'acceptation

- [ ] Coller un chemin de plus de `MAX_POINTS` sommets est refusé avec un message clair.
- [ ] `centerPoints` ne passe plus les tableaux en arguments étalés.
- [ ] Test : collage au-delà de la borne → scène inchangée, erreur renvoyée.
- [ ] `parsePoints` (`path.js:77`, attribut `points` ou nombres nus) borné par `MAX_POINTS` et filtré par `Number.isFinite` (`1e999` → `Infinity` aujourd'hui).
- [ ] Nombre de sous-chemins de `parseD` borné (chaque sous-chemin devient une forme dans `addTraces`).
