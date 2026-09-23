---
{
  "id": "T-0041",
  "titre": "Interface « design E » : panneaux flottants sombres",
  "colonne": "en-cours",
  "priorite": "haute",
  "tags": ["ui"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null
}
---

## Contexte

Maquette « E sombre » (artefact Illu — 4 interfaces, écrans SombreCalque / SombreForme) : zone de dessin plein écran, panneaux flottants arrondis, arbre calques → formes à gauche, réglages contextuels à droite (calque OU forme), outils en pastilles en bas, zoom + grille en bas à gauche, Annuler/Rétablir/Exporter en haut à droite. La sélection devient un carré pointillé autour de la forme (ou des formes du calque).

Décisions : pas de poignées d'angle ; actions de ligne de l'arbre au survol/focus ; import JSON et coller un tracé dans le menu Exporter.

## Critères d'acceptation

- [ ] Palette et formes de la maquette (fond 18, panneaux 40, champs 58, accent #EE4722, forme sélectionnée #3BA2D6, pastilles).
- [ ] Arbre unique calques + formes du calque déplié ; visibilité, monter/descendre, supprimer, renommer toujours disponibles.
- [ ] Panneau droit : réglages du calque seuls si aucune forme sélectionnée, réglages de la forme seuls sinon.
- [ ] Couleur : pastilles + sélecteur libre + hex ; épaisseur au curseur.
- [ ] « Répéter » (modificateurs numérotés) et « Faire varier les itérations » (interpolations) gardent tous leurs réglages.
- [ ] Trait : segments Plein/Tirets/Points, motif libre conservé, bout Net/Rond/Carré.
- [ ] Barre d'outils en bas, zoom + grille en bas à gauche, Annuler/Rétablir en boutons, menu Exporter (SVG, JSON, importer, coller un tracé).
- [ ] Sélection = rectangle pointillé (bleu autour de la forme source, orange autour du calque sans forme sélectionnée), absent de l'export.
- [ ] Aucune fonctionnalité existante retirée ; tests verts.
