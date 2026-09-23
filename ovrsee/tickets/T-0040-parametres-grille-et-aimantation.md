---
{
  "id": "T-0040",
  "titre": "Paramètres : grille et aimantation",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": "2026-09-23-parametres-grille-aimantation.md"
}
---

## Contexte

Placer des formes avec précision demande une grille. Il n'existe aucun réglage d'espace de travail.

## Critères d'acceptation

- [ ] Un bouton Paramètres dans la barre du haut ouvre un panneau avec une case Grille et un nombre de divisions.
- [ ] Grille active : elle s'affiche sur le stage, suit le zoom, et n'apparaît pas dans l'export SVG.
- [ ] Grille active : dessin, sommets de tracé et déplacement s'aimantent aux intersections.
- [ ] Grille carrée ou ronde ; la ronde se règle en nombre de cercles et de divisions (rayons), aimantation aux croisements cercle × rayon.
- [ ] Le réglage survit au rechargement de la page.
