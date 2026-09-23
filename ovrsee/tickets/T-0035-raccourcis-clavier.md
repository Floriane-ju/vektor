---
{
  "id": "T-0035",
  "titre": "Raccourcis clavier",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "ui",
    "a11y"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Seul le zoom a des raccourcis. Changer d'outil, supprimer la sélection,
dupliquer, naviguer d'un calque à l'autre passent tous par un clic dans un
panneau, alors que le regard est sur le dessin. Le panneau de suppression a
bien un état de confirmation, mais aucune touche ne le déclenche depuis le
canvas.

## Critères d'acceptation

- [ ] Les outils se choisissent au clavier (une touche par forme, une pour le
      curseur), et le sélecteur reflète le changement.
- [ ] `Suppr` supprime la forme sélectionnée, `Cmd/Ctrl + D` la duplique.
- [ ] `Échap` désélectionne.
- [ ] Les flèches déplacent la forme sélectionnée d'un pixel, dix avec `Maj`.
- [ ] Aucun raccourci ne se déclenche pendant la saisie dans un champ.
- [ ] La liste des raccourcis est consultable depuis l'interface.
