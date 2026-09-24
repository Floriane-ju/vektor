---
{
  "id": "T-0028",
  "titre": "Remplissage pair-impair du calque",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "rendu"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

Chaque forme est un nœud SVG indépendant : deux cercles remplis qui se
chevauchent donnent un aplat continu. La planche joue au contraire de
l'intersection inversée — deux disques dont la zone commune se creuse, un
damier circulaire, une lune qui mord sur son disque.

SVG le fait nativement : un tracé unique portant `fill-rule="evenodd"` creuse
ses recoupements. Le coût est de réunir les formes d'un calque en un seul
`<path>` quand l'option est active, pas d'écrire un moteur booléen.

## Critères d'acceptation

- [ ] Une option de calque « Recoupements creux » réunit ses formes en un
      tracé unique à remplissage pair-impair.
- [ ] Deux disques remplis qui se chevauchent rendent alors une intersection
      vide.
- [ ] L'option éteinte, le rendu est strictement celui d'aujourd'hui.
- [ ] Les copies produites par les modificateurs participent au même tracé.
