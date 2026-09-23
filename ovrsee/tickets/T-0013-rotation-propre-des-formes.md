---
{
  "id": "T-0013",
  "titre": "Rotation propre des formes",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "formes",
    "rendu"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0012"
}
---

## Contexte

Une forme n'a pas d'angle : `Element` porte `x, y, rx, ry` et rien d'autre. Un
rectangle est donc toujours droit, une ligne ne s'incline que par le rapport de
ses demi-extensions, et un polygone à venir serait figé sur son axe.

`modifiers.js` le note déjà : « pas de rotation propre des formes — à ajouter
le jour où une forme orientée arrive ». Ce jour est arrivé : la moitié des
motifs de la planche sont des formes inclinées répétées.

L'angle appartient à la forme, pas au calque : deux formes d'un même dessin
s'inclinent rarement pareil.

## Critères d'acceptation

- [ ] `Element` porte un champ `rotation` en degrés, nul par défaut.
- [ ] Le panneau propriétés propose un champ « Rotation » pour toute forme qui
      en tire un effet visible (le cercle et le point en sont dispensés).
- [ ] Le renderer émet la rotation autour du centre de la forme, sans changer
      le point `x, y` du modèle.
- [ ] L'export SVG et l'import JSON conservent la rotation.
