import { clamp } from '../math.js';
import { icon } from './icons.js';

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
 *
 * Le glissement verrouille le pointeur (Pointer Lock) : le vrai curseur
 * disparaît, un faux le remplace et repasse de l'autre côté de l'écran
 * quand il en touche le bord — le geste n'est plus borné par la fenêtre.
 * Verrou refusé (ou Échap) : on retombe sur `clientX`, borné par l'écran.
 */

const PX_PER_STEP = 4;
const THRESHOLD = 3;
const SHIFT_FACTOR = 10;

/* Position modulo la taille de la fenêtre : sortir à droite, rentrer à gauche. */
export const wrap = (value, size) => ((value % size) + size) % size;

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
    const start = Number(input.value) || 0;
    let dx = 0;
    /* `null` = position à relire au prochain mouvement, sans delta. */
    let lastX = event.clientX;
    let scrubbing = false;
    /* Faux curseur, posé à la place du vrai le temps du verrou. */
    let ghost = null;
    let ghostX = event.clientX;
    let ghostY = event.clientY;
    const locked = () => document.pointerLockElement === input;

    const lock = () => {
      /* Chromium renvoie une promesse, Firefox rien : refus = repli sur clientX. */
      input.requestPointerLock?.()?.catch?.(() => {});
    };
    const showGhost = () => {
      if (!locked()) {
        ghost?.remove();
        ghost = null;
        return;
      }
      if (!ghost) {
        ghost = icon('scrub');
        ghost.classList.add('scrub-ghost');
        document.body.append(ghost);
      }
      ghost.style.translate = `${ghostX}px ${ghostY}px`;
    };

    const move = (moveEvent) => {
      if (locked()) {
        dx += moveEvent.movementX;
        ghostX = wrap(ghostX + moveEvent.movementX, window.innerWidth);
        ghostY = clamp(ghostY + moveEvent.movementY, 0, window.innerHeight);
      } else {
        dx += moveEvent.clientX - (lastX ?? moveEvent.clientX);
        lastX = ghostX = moveEvent.clientX;
        ghostY = moveEvent.clientY;
      }
      showGhost();
      if (!scrubbing && Math.abs(dx) < THRESHOLD) return;
      if (!scrubbing) lock();
      scrubbing = true;
      const value = scrubValue(input, start, dx, moveEvent.shiftKey);
      if (value === input.value) return;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    /* Verrou perdu en cours de geste (Échap) : le vrai curseur revient où il
       était, on repart de là sans saut de valeur. */
    const lockChange = () => {
      if (!locked()) lastX = null;
      showGhost();
    };
    const up = () => {
      input.removeEventListener('pointermove', move);
      input.removeEventListener('pointerup', up);
      input.removeEventListener('pointercancel', up);
      document.removeEventListener('pointerlockchange', lockChange);
      if (locked()) document.exitPointerLock();
      ghost?.remove();
      if (!scrubbing) {
        input.focus();
        input.select();
      }
    };
    document.addEventListener('pointerlockchange', lockChange);
    input.addEventListener('pointermove', move);
    input.addEventListener('pointerup', up);
    input.addEventListener('pointercancel', up);
  });
};
