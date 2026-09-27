---
{
  "id": "T-0116",
  "titre": "Profondeur réelle dans un calque 3D (lignes cachées)",
  "colonne": "fait",
  "priorite": "haute",
  "charge": "xl",
  "tags": [
    "3d",
    "rendu"
  ],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": "2026-09-27-profondeur-reelle-dans-un-calque-3d-lignes-cachees-fin-des-f.md"
}
---

## Contexte

Dans un calque en 3D, qui passe devant dépend de l'ordre de dessin : des
cylindres au fond du dessin passent devant un anneau du premier plan. Il faut
une profondeur réelle, façon Blender, calculée par suppression des lignes
cachées dans le calque (`src/hidden.js`).

## Critères d'acceptation

- [ ] Dans un calque 3D, ce qui est plus loin est caché par ce qui est devant, quel que soit l'ordre des formes (même rendu en inversant l'ordre).
- [ ] Un axe (point extrudé) qui traverse un anneau est caché dans la matière, visible dans le trou.
- [ ] Aplats triés par face (loin → près) ; traits exacts.
- [ ] « Opaque » éteint = fil de fer : le volume ne cache rien, pas même ses propres arêtes arrière.
- [ ] Entre calques, l'ordre de l'arbre reste la règle (le calque du dessus cache celui du dessous).
- [ ] Banc des parois pas pire que ×2 ; `pnpm test` vert.
