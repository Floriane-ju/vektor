---
{
  "id": "T-0031",
  "titre": "Export PNG et copie du SVG",
  "colonne": "fait",
  "priorite": "basse",
  "tags": [
    "export"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-24",
  "plan": null,
  "epic": "T-0026"
}
---

## Contexte

La seule sortie est un téléchargement `.svg`. Poser l'illustration dans une
maquette, un message ou une planche contact demande un passage par un autre
outil pour la rastériser, et coller le code SVG oblige à rouvrir le fichier
téléchargé.

Le rendu est déjà un nœud SVG sérialisable : le PNG s'en déduit par un
`<canvas>`, sans dépendance.

## Critères d'acceptation

- [ ] Un bouton « Copier le SVG » met le document dans le presse-papier.
- [ ] Un export PNG produit une image à une échelle réglable (1×, 2×, 4×).
- [ ] Le PNG reprend le fond de scène de T-0030 ; sans fond, il est
      transparent.
