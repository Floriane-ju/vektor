import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/* Lu du disque : un import `?raw` de CSS arrive vide sous Vitest. */
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

/** Nom d'animation sans `@keyframes` : le navigateur l'ignore sans rien dire. */
it('chaque animation citée a ses @keyframes', () => {
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]));
  const used = [...css.matchAll(/animation(?:-name)?\s*:([^;}]+)/g)]
    .flatMap((match) => match[1].split(','))
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((name) => /^[a-z][\w-]*$/.test(name) && name !== 'none');
  expect(used.filter((name) => !defined.has(name))).toEqual([]);
});

/* Hors `:root`, espacements et hauteurs de contrôle passent par l'échelle. */
const rules = css.slice(css.indexOf('}', css.indexOf(':root {')) + 1);

it('espacements sans px bruts hors :root', () => {
  const raw = [...rules.matchAll(/(?<![\w-])(?:gap|padding|margin)[\w-]*\s*:\s*([^;}]+)/g)]
    .map((match) => match[0])
    .filter((decl) => /(?<![\w.-])[1-9]\d*px/.test(decl));
  expect(raw).toEqual([]);
});

it('durées, épaisseur de contour, anneau de focus et graisses en tokens', () => {
  expect(rules.match(/\b\d+ms\b|\b\d*\.\d+s\b/g)).toBeNull();
  expect(rules.match(/1\.5px|outline:\s*2px|font(?:-weight)?:\s*[1-9]00\b/g)).toBeNull();
});
