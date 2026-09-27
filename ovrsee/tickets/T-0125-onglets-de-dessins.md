---
{
  "id": "T-0125",
  "titre": "Onglets de dessins",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "ui",
    "persistance"
  ],
  "cree": "2026-09-27",
  "maj": "2026-09-27",
  "plan": "2026-09-27-onglets-de-dessins-vektor-1-nouveau.md"
}
---

## Contexte

Un seul dessin par navigateur. On veut une barre d'onglets à droite du logo, un dessin indépendant par onglet.

## Critères d'acceptation

- [ ] Pastille à droite du logo : « Vektor 1 » par défaut, bouton « + Nouveau ».
- [ ] « + Nouveau » ouvre un dessin vierge ; chaque onglet a sa scène, son historique d'annulation, sa sauvegarde locale.
- [ ] L'ancienne sauvegarde reste « Vektor 1 » sans perte.
- [ ] Recharger rouvre tous les onglets et l'onglet actif.
- [ ] Double-clic renomme ; × ferme (confirmation si non vide), le dernier onglet ne se ferme pas.
