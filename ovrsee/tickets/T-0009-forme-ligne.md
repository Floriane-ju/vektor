---
{
  "id": "T-0009",
  "titre": "Forme ligne",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "s",
  "tags": ["core", "ui"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

Les trois formes disponibles — cercle, point, rectangle — sont toutes
symétriques, donc décrites par des demi-extensions positives depuis leur centre.
Une ligne est orientée : celle qui monte n'est pas celle qui descend, et la
ramener à une valeur absolue l'aurait couchée dans une seule diagonale.

## Décision

`rx` / `ry` restent des demi-extensions depuis le centre, mais gardent leur signe
sur les formes marquées `signed`. `clampExtent(type, valeur)` est le seul endroit
où cette borne est décidée : le renderer, l'import JSON et le panneau propriétés
y passent tous, au lieu de recopier trois fois un `Math.max(0, …)`.

Conserver `x, y` au milieu de la ligne — plutôt qu'à l'une de ses extrémités —
garde le modèle homogène : l'échelle interpolée l'étire depuis son centre et un
modificateur la déplace d'un seul point, exactement comme les autres formes. Le
glissement fait donc suivre le centre à mi-chemin du curseur.

## Critères d'acceptation

- [x] La ligne figure dans le sélecteur de formes et se trace au glisser, d'un
      bout à l'autre du geste, dans les quatre diagonales.
- [x] Un clic sans glissement pose une ligne horizontale de 120 px.
- [x] Les modificateurs et l'interpolation (opacité, échelle) s'y appliquent
      comme aux autres formes.
- [x] Le panneau propriétés affiche « Écart X » / « Écart Y » au lieu de
      « Largeur » / « Hauteur », valeurs signées.
- [x] L'export SVG émet un `<line>` ; l'aller-retour JSON conserve le signe des
      extensions, et une extension négative reste refusée aux autres formes.
