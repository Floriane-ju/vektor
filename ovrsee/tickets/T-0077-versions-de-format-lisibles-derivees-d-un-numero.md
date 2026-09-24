---
{
  "id": "T-0077",
  "titre": "Versions de format lisibles dérivées d'un numéro",
  "colonne": "backlog",
  "priorite": "basse",
  "charge": "s",
  "tags": [
    "code",
    "persistance"
  ],
  "cree": "2026-09-24",
  "maj": "2026-09-24",
  "plan": null
}
---

## Contexte

`READABLE_FORMATS` (`persistence.js:57-77`) et la liste « legacy » (`:361`) se
maintiennent à la main, séparément : au prochain bump, oublier l'une des deux
fait refuser ou relire autrement les fichiers de la version précédente.
Petites incohérences relevées au même endroit : `reserveIds` appelé deux fois
au chargement (`persistence.js:371` et `main.js:27`), ids d'interpolation en
double non refusés à l'import, `removeLayer` (`scene.js:472`) seule transition
qui ne recopie pas `...scene`.

## Critères d'acceptation

- [ ] La lisibilité et le mode legacy se déduisent du préfixe et du numéro de version, une seule source.
- [ ] `reserveIds` appelé une fois ; ids d'interpolation dupliqués refusés ; `removeLayer` recopie la scène.
- [ ] Tests de relecture de chaque format existant toujours verts.
