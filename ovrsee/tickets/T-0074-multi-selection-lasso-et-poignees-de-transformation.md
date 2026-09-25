---
{
  "id": "T-0074",
  "titre": "Multi-sélection et lasso",
  "colonne": "fait",
  "priorite": "moyenne",
  "charge": "l",
  "tags": [
    "ui"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-25",
  "plan": null,
  "epic": "T-0032"
}
---

## Contexte

Le modèle ne porte qu'un `activeElementId`. Pas de Maj+clic, pas de lasso.
Glisser dans le vide déplace la forme sélectionnée, ce qui ferme la porte à un
lasso. Les poignées de transformation sont sorties dans T-0108.

Tranché le 2026-09-25 :
- glisser dans le vide = lasso (Maj : ajoute à la sélection) ; déplacer part d'une forme ;
- sélection multiple limitée au calque actif ;
- poignées : ticket à part (T-0108).

## Critères d'acceptation

- [ ] Maj+clic (plan et arbre) ajoute / retire une forme de la sélection, dans le calque actif.
- [ ] Glisser dans le vide trace un lasso qui sélectionne les formes du calque actif qu'il touche.
- [ ] Chaque forme sélectionnée porte son cadre pointillé ; l'arbre marque les lignes sélectionnées.
- [ ] Déplacer (glisser, flèches), dupliquer (⌘D), supprimer (Suppr) plusieurs formes en un geste et un pas d'historique.
- [ ] Carte du trait : couleur et épaisseur affichent « multi » si elles diffèrent dans la sélection ; un réglage les rend identiques sur toutes.
