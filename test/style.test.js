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
