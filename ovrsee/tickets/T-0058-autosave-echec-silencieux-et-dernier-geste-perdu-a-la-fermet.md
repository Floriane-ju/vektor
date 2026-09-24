---
{
  "id": "T-0058",
  "titre": "Autosave : échec silencieux et dernier geste perdu à la fermeture",
  "colonne": "backlog",
  "priorite": "haute",
  "charge": "s",
  "tags": [
    "persistance"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0056"
}
---

## Contexte

`saveLocal` avale l'erreur (`persistence.js:383-390`, `catch { /* Quota plein… */ }`) :
quota plein, on croit le travail sauvé et on retrouve une version ancienne.
`debounce` (`persistence.js:424-430`) n'a pas de `flush` et rien n'écoute
`pagehide` : un geste fait moins de 400 ms avant la fermeture est perdu.
À l'inverse, un simple changement de sélection re-sérialise toute la scène,
en JSON indenté, ce qui rapproche du quota.

## Critères d'acceptation

- [ ] Un échec d'écriture s'affiche dans la barre d'état (ton erreur) et propose d'exporter.
- [ ] Fermer ou recharger l'onglet juste après un geste le conserve (`flush` sur `pagehide`).
- [ ] Un changement de sélection seule n'écrit pas (`next.layers === previous.layers`).
- [ ] L'autosave écrit un JSON compact ; l'export fichier reste indenté.
