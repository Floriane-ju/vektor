---
{
  "id": "T-0127",
  "titre": "Audit front : design system, harmonisation, code mort",
  "colonne": "backlog",
  "priorite": "moyenne",
  "charge": "l",
  "tags": [
    "epic",
    "audit"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": null,
  "type": "epic"
}
---

## Contexte

Audit du 2026-09-28 (design system, harmonisation, code mort, structure). Design system
existant : tokens `:root` de `style.css:4-42` (couleurs, rayons, cinq tailles de police,
gouttières, easing/durées). Manquent : espacement, hauteurs de contrôle, graisses,
bordures, opacités, z-index. Pas de couleur brute dans `style.css` hors `:root` : les
fuites sont côté JS (chrome SVG d'écran).

Enfants : T-0128 à T-0136, T-0138, T-0139. Constat de robustesse d'import rangé sous
T-0056 (T-0137) ; collage de `points` ajouté à T-0059.

Non ticketé, par retenue : JSDoc/`@typedef` absents (pas de TS, choix du projet) ;
mélange `mount*`/`create*`/`draw*` cosmétique ; classes posées en JS sans règle CSS
(`slider-field`, `section-title`, `stroke-card`) = crochets inoffensifs.

## Critères d'acceptation

- [ ] Tous les enfants soldés.
- [ ] `grep -E '#[0-9a-fA-F]{6}' src/ui src/renderer-svg.js` ne renvoie que des données de scène ou des masques (`#fff`/`#000`).
