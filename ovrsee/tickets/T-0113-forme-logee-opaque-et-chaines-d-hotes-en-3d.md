---
{
  "id": "T-0113",
  "titre": "Forme logée opaque et chaînes d'hôtes en 3D",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "3d",
    "rendu"
  ],
  "cree": "2026-09-25",
  "maj": "2026-09-25",
  "plan": null
}
---

## Contexte

Une forme logée dans un anneau (Ellipse 2 dans Ellipse 1) ne cache rien : on
voit derrière elle la paroi du fond de l'anneau et l'axe qui la traverse. Une
forme logée n'a pas de silhouette d'occlusion, et n'est tranchée que par son
hôte direct.

## Critères d'acceptation

- [ ] Une forme logée pleine cache ce qui est dessiné avant elle, dans la seule
      partie visible de ses tranches.
- [ ] Un axe logé dans une forme elle-même logée est tranché par toute la
      chaîne d'hôtes, et dessiné après son hôte direct.
- [ ] Un volume fermé logé n'est pas subdivisé aux coupes.
- [ ] L'opacité est une option de la forme (`opaque`, défaut vrai, format `@31`),
      interrupteur « Opaque » en 3D sur une forme à profondeur.
- [ ] Tests de rendu couvrant ces cas.
