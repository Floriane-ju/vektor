import { clamp } from '../math.js';

/**
 * Glisser horizontal sur les champs numériques, comme dans Figma : à droite
 * la valeur monte d'un `step` tous les `PX_PER_STEP` pixels, à gauche elle
 * descend (Maj ×10), bornée par `min`/`max`. Un clic sans glissement rend la
 * main à la saisie.
 *
 * Délégué au document : les panneaux reconstruisent leurs champs, un écouteur
 * par champ serait à rebrancher à chaque fois. Chaque pas émet `input` puis
 * `change`, pour les deux familles d'écouteurs ; `ui/history.js` range le
 * glissement entier en un seul pas, borné par pointerdown → pointerup.
 */

const PX_PER_STEP = 4;
const THRESHOLD = 3;
const SHIFT_FACTOR = 10;

const decimals = (step) => (String(step).split('.')[1] ?? '').length;

export const scrubValue = (input, start, dx, shift) => {
  const step = Number(input.step) || 1;
  const raw = start + Math.round(dx / PX_PER_STEP) * step * (shift ? SHIFT_FACTOR : 1);
  const min = input.min === '' ? -Infinity : Number(input.min);
  const max = input.max === '' ? Infinity : Number(input.max);
  return String(Number(clamp(raw, min, max).toFixed(decimals(step))));
};

export const mountScrub = () => {
  document.addEventListener('pointerdown', (event) => {
    const input = event.target;
    if (event.button !== 0 || !input.matches?.('input[type="number"]:not(:focus, :disabled)')) {
      return;
    }
    /* Pas de focus ni de sélection de texte pendant le geste. */
    event.preventDefault();
    input.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const start = Number(input.value) || 0;
    let scrubbing = false;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!scrubbing && Math.abs(dx) < THRESHOLD) return;
      scrubbing = true;
      const value = scrubValue(input, start, dx, moveEvent.shiftKey);
      if (value === input.value) return;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const up = () => {
      input.removeEventListener('pointermove', move);
      input.removeEventListener('pointerup', up);
      input.removeEventListener('pointercancel', up);
      if (!scrubbing) {
        input.focus();
        input.select();
      }
    };
    input.addEventListener('pointermove', move);
    input.addEventListener('pointerup', up);
    input.addEventListener('pointercancel', up);
  });
};
