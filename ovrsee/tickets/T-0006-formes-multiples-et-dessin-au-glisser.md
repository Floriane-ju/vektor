---
{
  "id": "T-0006",
  "titre": "Formes multiples et dessin au glisser",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "m",
  "tags": ["ui", "core"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

La v1 ne sait dessiner qu'un cercle, et le clic pose une forme à taille fixe :
pour la redimensionner il faut passer par le panneau propriétés. Deux manques
signalés à l'usage.

Le modèle d'élément doit donc porter deux demi-extensions (`rx`, `ry`) au lieu
d'un `radius` unique — un rectangle a deux dimensions indépendantes. Les scènes
déjà enregistrées sont en `illu/scene@1` avec `radius` : elles doivent continuer
à s'ouvrir.

## Critères d'acceptation

- [ ] Trois outils sélectionnables — cercle, point, rectangle — atteignables au
      clavier.
- [ ] Presser puis glisser sur le plan de travail dessine la forme de l'outil
      actif : le point de départ est le centre, la distance parcourue donne la
      taille, et l'aperçu suit le curseur.
- [ ] Un clic sans glissement pose la forme à la taille par défaut de son type.
- [ ] Le rectangle a une largeur et une hauteur indépendantes ; le cercle et le
      point restent circulaires quel que soit le glissement.
- [ ] Le panneau propriétés expose la taille de la forme active : rayon pour
      cercle et point, largeur et hauteur pour rectangle.
- [ ] Un projet enregistré au format `illu/scene@1` se recharge sans erreur, son
      `radius` devenant `rx` et `ry`.
- [ ] Les modificateurs et l'interpolation s'appliquent aux trois formes.
