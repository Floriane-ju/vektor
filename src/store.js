/**
 * Profondeur de l'historique d'annulation. Chaque pas n'est qu'une référence
 * vers une scène déjà construite — les transitions partagent tout ce qu'elles
 * ne changent pas — donc la borne protège de l'accumulation, pas d'un coût
 * par pas.
 */
export const HISTORY_LIMIT = 100;

/**
 * Store minimal : une référence d'état, un jeu d'abonnés, un historique.
 *
 * `apply` prend une transition de `scene.js` — toutes ont la signature
 * `(scene, ...args) -> scene` — ce qui évite d'écrire un type d'action par
 * geste d'UI. Si la transition rend la même référence (geste sans effet, par
 * exemple déplacer le calque déjà au sommet), personne n'est notifié.
 *
 * L'historique est une pile de scènes : les transitions étant immuables, il
 * n'y a pas de diff à calculer. Un changement de sélection seule (mêmes
 * `layers`) n'y entre pas — annuler doit défaire le dessin, pas les clics.
 *
 * `begin(key)` / `end(key)` bornent un geste continu (glissement, slider) :
 * tous les changements entre les deux forment un seul pas. La clé identifie le
 * geste, pour qu'un `end` tardif d'un autre geste ne ferme pas celui en cours.
 */
export const createStore = (initialState) => {
  let state = initialState;
  const listeners = new Set();
  let past = [];
  let future = [];
  let gesture = null;

  const notify = () => {
    for (const listener of listeners) listener(state);
  };

  const record = (previous, next) => {
    if (next.layers === previous.layers) return;
    if (gesture?.recorded) return;
    if (gesture) gesture.recorded = true;
    past = [...past, previous].slice(-HISTORY_LIMIT);
    future = [];
  };

  /* Prend la dernière scène de `from`, pousse la courante sur `to`. */
  const travel = (from, to) => {
    if (from.length === 0) return [from, to];
    // Geste en cours : sa suite part de la scène restaurée, en un seul pas.
    if (gesture) gesture.recorded = false;
    const moved = [from.slice(0, -1), [...to, state]];
    state = from.at(-1);
    notify();
    return moved;
  };

  return {
    get: () => state,
    set(next) {
      if (next === state) return;
      record(state, next);
      state = next;
      notify();
    },
    apply(transition, ...args) {
      this.set(transition(state, ...args));
    },
    begin(key) {
      if (gesture?.key !== key) gesture = { key, recorded: false };
    },
    end(key) {
      if (gesture?.key === key) gesture = null;
    },
    undo() {
      [past, future] = travel(past, future);
    },
    redo() {
      [future, past] = travel(future, past);
    },
    /**
     * Change de document (onglet de dessin) : installe une autre scène avec
     * son propre historique, rend ceux du document quitté.
     */
    swap({ state: nextState, past: nextPast = [], future: nextFuture = [] }) {
      const previous = { state, past, future };
      state = nextState;
      past = nextPast;
      future = nextFuture;
      gesture = null;
      notify();
      return previous;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
