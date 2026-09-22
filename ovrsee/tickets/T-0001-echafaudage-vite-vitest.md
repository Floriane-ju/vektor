---
{
  "id": "T-0001",
  "titre": "Échafaudage Vite + vitest",
  "colonne": "revue",
  "priorite": "haute",
  "charge": "xs",
  "tags": ["build"],
  "cree": "2026-09-22",
  "maj": "2026-09-22",
  "plan": "2026-09-22-outil-d-illustration-vectorielle-generative.md"
}
---

## Contexte

Le dépôt est vide. `ovrsee.config.json` annonce `pnpm dev` sur
`http://localhost:5173` : Vite est attendu. Rien ne peut être lancé ni testé
tant que le squelette n'existe pas.

Deux devDeps, aucune dépendance runtime : le rendu se fait en SVG DOM natif.

## Critères d'acceptation

- [ ] `pnpm install` installe `vite` et `vitest` et rien d'autre.
- [ ] `pnpm dev` sert `index.html` sur le port 5173.
- [ ] `pnpm test` lance vitest et trouve `test/`.
- [ ] `index.html` affiche la grille trois colonnes (240px | 1fr | 280px) avec
      le `<svg id="stage">` au centre, en thème sombre, contraste texte ≥ 4.5:1.
- [ ] `pnpm-lock.yaml` est présent, aucun `package-lock.json`.
