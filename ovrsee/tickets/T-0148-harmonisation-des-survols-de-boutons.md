---
{
  "id": "T-0148",
  "titre": "Harmonisation des survols de boutons",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": ["ui", "design-system"],
  "cree": "2026-09-29",
  "maj": "2026-09-29",
  "plan": null
}
---

## Contexte

Le survol du bouton Grille ne ressemble pas à celui des autres boutons : cochée,
la pastille (clair sur sombre) prend au survol le fond `--bg-field` de
`.pill-btn:hover` avec son texte sombre — illisible. Plus largement, chaque
famille de bouton a sa propre règle de survol.

## Critères d'acceptation

- [x] Un bouton pressé/principal (Grille cochée, bouton principal, segment coché) a le même survol partout.
- [x] Les boutons au repos transparents ont le même survol (fond `--bg-field`).
- [x] `pnpm test` passe.
