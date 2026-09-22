/**
 * Store minimal : une référence d'état, un jeu d'abonnés.
 *
 * `apply` prend une transition de `scene.js` — toutes ont la signature
 * `(scene, ...args) -> scene` — ce qui évite d'écrire un type d'action par
 * geste d'UI. Si la transition rend la même référence (geste sans effet, par
 * exemple déplacer le calque déjà au sommet), personne n'est notifié.
 */
export const createStore = (initialState) => {
  let state = initialState;
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  return {
    get: () => state,
    set(next) {
      if (next === state) return;
      state = next;
      notify();
    },
    apply(transition, ...args) {
      this.set(transition(state, ...args));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
