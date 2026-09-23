/**
 * Annuler / rétablir au clavier, et découpage des gestes continus en pas.
 *
 * Les gestes sont repérés au niveau du document plutôt que dans chaque
 * panneau : tout glissement commence par un `pointerdown` et tout réglage au
 * champ par un `input`, quel que soit le contrôle. Un `pointerdown` ouvre un
 * pas qui court jusqu'au relâchement ; un champ ouvre le sien au premier
 * `input` et le ferme à son `change` (validation ou perte du focus).
 */

/* Là, Cmd+Z appartient au texte en cours de saisie, pas à la scène. */
const TEXT_ENTRY = 'input:is([type="text"], [type="number"], [type="search"]), textarea';

export const mountHistory = ({ store }) => {
  let pointer = null;
  /* Capture : le pas s'ouvre avant que le geste ne modifie la scène. */
  document.addEventListener(
    'pointerdown',
    (event) => {
      pointer = event;
      store.begin(pointer);
    },
    true,
  );
  /* Phase de bouillonnement : le dernier `pointerup` du stage est déjà appliqué. */
  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, () => store.end(pointer));
  }
  document.addEventListener('input', (event) => store.begin(event.target), true);
  document.addEventListener('change', (event) => store.end(event.target));

  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    if (event.target.closest?.(TEXT_ENTRY)) return;
    event.preventDefault();
    if (event.shiftKey) store.redo();
    else store.undo();
  });
};
