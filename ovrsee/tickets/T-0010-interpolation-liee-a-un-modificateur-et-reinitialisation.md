---
{
  "id": "T-0010",
  "titre": "Interpolation liée à un modificateur, et réinitialisation",
  "colonne": "fait",
  "priorite": "haute",
  "tags": [
    "noyau",
    "ui"
  ],
  "cree": "2026-09-23",
  "maj": "2026-09-22",
  "plan": null
}
---

## Contexte

La rampe d'interpolation court aujourd'hui sur le total des copies de la pile :
deux modificateurs de 5 et 2 copies donnent dix valeurs d'opacité réparties de
bout en bout. On ne peut pas dire « l'opacité suit le miroir, pas le pas », donc
un motif dont seule une dimension doit s'éteindre n'est pas atteignable.

Chaque propriété interpolée doit pouvoir suivre soit la rampe globale, soit
l'indice d'un seul étage de la pile.

Second manque : rien ne ramène les réglages d'interpolation à leur valeur
neutre. Une fois quatre curseurs déplacés, revenir à l'état d'origine se fait
à la main, curseur par curseur.

## Critères d'acceptation

- [x] Chaque propriété interpolée (opacité, échelle) se lie au choix à la rampe
      globale ou à un modificateur nommé de la pile, indépendamment de l'autre.
- [x] Liée à un étage, la valeur ne dépend que de l'indice de copie de cet
      étage : deux copies qui n'en diffèrent pas partagent la même valeur.
- [x] Déplacer un modificateur dans la pile emmène la liaison avec lui ;
      le supprimer ramène la propriété liée à la rampe globale.
- [x] Un bouton remet l'interpolation dans son état d'origine : plages neutres
      et rampes globales.
- [x] Les liaisons survivent à l'aller-retour JSON ; un fichier antérieur se
      relit avec des rampes globales.
