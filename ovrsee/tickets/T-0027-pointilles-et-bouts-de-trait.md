---
{
  "id": "T-0027",
  "titre": "Pointillés et bouts de trait",
  "colonne": "backlog",
  "priorite": "moyenne",
  "tags": ["rendu"],
  "cree": "2026-09-23",
  "maj": "2026-09-23",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

Le renderer pose `stroke-width` et rien d'autre. Les anneaux en tirets, les
cercles pointillés et les traits à bouts ronds de la planche sont donc hors
d'atteinte — sauf à répéter une forme « point » des centaines de fois, ce qui
alourdit le fichier pour un résultat approximatif.

Comme la couleur et l'épaisseur, le style de trait appartient au calque : un
calque est un coup de crayon.

## Critères d'acceptation

- [ ] Le calque porte un motif de tirets réglable (plein, tirets, points, et
      une saisie libre), et le choix du bout de trait.
- [ ] Un anneau en pointillés se rend et s'exporte identique.
- [ ] Les tirets gardent leur échelle sous les interpolations d'échelle — ou,
      si le choix est de les figer, il est explicite et documenté.
