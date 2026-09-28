---
{
  "id": "T-0134",
  "titre": "Contrôles DOM réinventés hors ui/fields.js",
  "colonne": "backlog",
  "priorite": "moyenne",
  "charge": "m",
  "tags": [
    "ui",
    "harmonisation"
  ],
  "cree": "2026-09-28",
  "maj": "2026-09-28",
  "plan": null,
  "epic": "T-0127"
}
---

## Contexte

CLAUDE.md fait de `ui/fields.js` le seul module de contrôles, mais :

- bouton pilule construit 6 fois : `src/ui/history.js:14` (`pillButton`), `zoom.js:12`, `settings.js:264`, `shortcuts.js:80,86`, `export-menu.js:137`, `drawing-tabs.js:113`.
- `src/ui/settings.js:150` redéfinit un `field` homonyme (autre balisage), `:158` `numberInput` doublonne `fields.input`, `:189-209` input/select/option à la main.
- boutons à la main alors que `el`/`textButton`/`iconButton` existent : `layer-panel.js:105,120,263-274`, `shape-list.js:94-100,201`, `drawing-tabs.js:80-110`, `export-menu.js:14`.
- `src/ui/drawing-tabs.js:116-121` refait `rebuildWithFocus` (`ui/list.js`) sans la cascade de repli de `restoreFocus`.
- cycle d'import `ui/fields.js:5` ↔ `ui/settings.js:2` (fonctionne parce que les appels sont différés).

## Critères d'acceptation

- [ ] Un seul `pillButton`, dans `ui/fields.js`, utilisé par les six panneaux.
- [ ] `settings.js` passe par `field`/`input`/`select` de `fields.js`.
- [ ] `drawing-tabs.js` passe par `rebuildWithFocus`.
- [ ] Plus de cycle `fields.js` ↔ `settings.js` (`loadCollapsed`/`saveCollapsed` déplacés).
- [ ] `pnpm test` vert (dont `app.test.js`, `drawing-tabs.test.js`).
