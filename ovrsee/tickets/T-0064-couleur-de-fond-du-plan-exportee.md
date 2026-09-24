---
{
  "id": "T-0064",
  "titre": "Couleur de fond du plan, exportée",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "m",
  "tags": [
    "export",
    "rendu"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

Le fond sombre vient du CSS (`--stage: #1b1b1b`), pas de la scène. Le PNG
est transparent (commentaire de `toPng`, `renderer-svg.js:668`), le SVG aussi :
dans une visionneuse à fond blanc, le trait turquoise par défaut devient
illisible. C'est exactement le critère de l'epic : « un fichier exporté est
utilisable tel quel, fond compris ».

## Critères d'acceptation

- [ ] Un réglage de fond dans la scène (couleur ou transparent), visible sur le plan.
- [ ] SVG et PNG exportés portent ce fond (`<rect>` plein cadre), ou rien si transparent.
- [ ] Changement de modèle : `FORMAT` passe au numéro suivant, les anciens fichiers se relisent (fond par défaut = fond actuel de l'écran).
