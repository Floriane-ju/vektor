---
{
  "id": "T-0027",
  "titre": "Pointillés et bouts de trait",
  "colonne": "fait",
  "priorite": "moyenne",
  "tags": [
    "rendu"
  ],
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

Contrairement à la couleur et à l'épaisseur, le style de trait appartient à la
forme : un même calque mêle un anneau pointillé et un cercle plein.

## Critères d'acceptation

- [x] La forme porte un motif de tirets réglable (plein, tirets, points, et
      une saisie libre), et le choix du bout de trait.
- [x] Un anneau en pointillés se rend et s'exporte identique.
- [x] Les tirets gardent leur échelle sous les interpolations d'échelle — ou,
      si le choix est de les figer, il est explicite et documenté.
