import { icon, ICON_SIZE } from './icons.js';
import { MAX_NAME_LENGTH } from '../scene.js';

/**
 * Briques communes aux deux listes reconstruites de l'interface — le panneau
 * calques et la liste des formes.
 *
 * Les deux se redessinent entièrement à chaque notification du store, ce qui
 * détruit le bouton qui avait le focus. Sans restauration, un utilisateur au
 * clavier se retrouve rejeté en haut de la page à chaque clic.
 */

export const iconButton = ({
  label,
  text,
  onClick,
  focusKey,
  danger = false,
  pressed = null,
  disabled = false,
}) => {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = danger ? 'icon-btn is-danger' : 'icon-btn';
  node.textContent = text;
  node.dataset.focusKey = focusKey;
  node.setAttribute('aria-label', label);
  node.title = label;
  node.disabled = disabled;
  if (pressed !== null) node.setAttribute('aria-pressed', String(pressed));
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return node;
};

/**
 * Rend le focus au contrôle qui l'avait, ou au plus proche encore utilisable.
 *
 * Trois cas le font disparaître : l'élément a été supprimé, il est devenu
 * `disabled` (monter ce qui est déjà au sommet), ou il n'était pas dans cette
 * liste. Un élément désactivé n'accepte pas le focus, d'où le repli en
 * cascade : même contrôle, puis le nom de la même ligne, puis `fallback`.
 *
 * Les clés suivent la forme `<rôle>-<identifiant>`.
 */
export const restoreFocus = (container, focusKey, fallback) => {
  const id = focusKey.slice(focusKey.indexOf('-') + 1);
  const candidates = [
    container.querySelector(`[data-focus-key="${focusKey}"]`),
    container.querySelector(`[data-focus-key="name-${id}"]`),
    fallback,
  ];
  candidates.find((node) => node && !node.disabled)?.focus();
};

/**
 * Vide le conteneur, le reconstruit, et replace le focus.
 *
 * `build` renvoie le contrôle sur lequel se rabattre quand celui qui avait le
 * focus n'existe plus — en pratique le bouton « ajouter » de la liste.
 */
export const rebuildWithFocus = (container, build) => {
  const focusKey = document.activeElement?.dataset?.focusKey ?? null;
  container.replaceChildren();
  const fallback = build();
  if (focusKey) restoreFocus(container, focusKey, fallback);
};

/**
 * Ne relance `render` que si la structure de la liste a changé.
 *
 * La card sélectionnée loge les réglages : reconstruire la liste à chaque
 * notification les détacherait, et le curseur en cours de glissement perdrait
 * le focus. `signature` résume ce que la liste affiche, pas les valeurs réglées.
 */
export const whenChanged = (signature, render) => {
  let last = null;
  return (scene) => {
    const next = signature(scene);
    if (next === last) return;
    last = next;
    render(scene);
  };
};

/* Pose la marque `data-<name>` le temps de ses animations : finies, elle
   part, et la taille qu'elles figeaient redevient libre (un bloc qui grandit
   ensuite n'est pas rogné). */
export const settle = (node, name, value = '') => {
  node.dataset[name] = value;
  const running = node.getAnimations?.({ subtree: true }) ?? [];
  Promise.all(running.map((animation) => animation.finished))
    .then(() => delete node.dataset[name])
    .catch(() => {});
};

/* Ligne disparue, remise à sa place le temps de s'effacer : inerte, hors
   de l'arbre d'accessibilité, sans clé de focus (`restoreFocus` ne doit pas
   la viser). Sa taille, mesurée en place, est le départ de l'animation
   (`--leave-w`, `--leave-h`) ; sans animation, elle part tout de suite. */
const fadeOut = (ghost) => {
  delete ghost.dataset.enter;
  inertGhost(ghost);
  const { width, height } = ghost.getBoundingClientRect();
  ghost.style.setProperty('--leave-w', `${width}px`);
  ghost.style.setProperty('--leave-h', `${height}px`);
  ghost.dataset.leave = '';
  removeAfterAnimation(ghost);
};

/** Rend un nœud sortant inerte : ni pointeur, ni clavier, ni lecteur d'écran, ni clé de focus. */
export const inertGhost = (ghost) => {
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  for (const node of [ghost, ...ghost.querySelectorAll('[data-focus-key]')]) delete node.dataset.focusKey;
  return ghost;
};

/** Retire le nœud à la fin de son animation — tout de suite s'il n'en a pas. */
export const removeAfterAnimation = (ghost) => {
  const name = getComputedStyle(ghost).animationName;
  if (!name || name === 'none') ghost.remove();
  else ghost.addEventListener('animationend', (event) => event.target === ghost && ghost.remove());
};

/**
 * Entrées et sorties d'une liste reconstruite. `mark(pairs, context, parent)`,
 * appelé une fois les nœuds du nouveau dessin en place, avec `pairs` =
 * `[nœud, id][]` dans l'ordre affiché :
 * - pose `data-enter` (et `--enter-i`, rang parmi les entrants ; `--enter-w`,
 *   `--enter-h`, sa taille mesurée en place, but de l'animation) sur les
 *   nœuds dont l'id n'était pas là au dessin précédent ;
 * - remet chaque nœud disparu à son ancienne place, entre ses voisins
 *   survivants (dans `parent` si la liste est vide), marqué `data-leave`.
 * Premier dessin, autre `context` (le propriétaire d'une pile), ou liste
 * remplacée en entier par d'autres (autre dessin) : ni entrée ni sortie. Une
 * liste vidée n'est pas remplacée : son dernier élément sort.
 */
export const presence = () => {
  let seen = null;
  let last;
  return (pairs, context = null, parent = null) => {
    const next = new Map(pairs.map(([node, id]) => [id, node]));
    const replaced =
      seen === null ||
      context !== last ||
      (seen.size > 0 && next.size > 0 && ![...seen.keys()].some((id) => next.has(id)));
    if (!replaced) {
      /* Toutes les mesures d'abord : une seule mise en page. */
      pairs
        .filter(([, id]) => !seen.has(id))
        .map(([node]) => [node, node.getBoundingClientRect()])
        .forEach(([node, { width, height }], i) => {
          node.style.setProperty('--enter-i', String(i));
          node.style.setProperty('--enter-w', `${width}px`);
          node.style.setProperty('--enter-h', `${height}px`);
          settle(node, 'enter');
        });
      const old = [...seen];
      let anchor = null;
      old.forEach(([id, ghost], i) => {
        if (next.has(id)) {
          anchor = next.get(id);
          return;
        }
        if (anchor) anchor.after(ghost);
        else {
          const after = old.slice(i + 1).find(([other]) => next.has(other));
          if (after) next.get(after[0]).before(ghost);
          else if (parent) parent.append(ghost);
          else return;
        }
        anchor = ghost;
        fadeOut(ghost);
      });
    }
    last = context;
    seen = next;
  };
};

/**
 * Fondu d'état d'une ligne reconstruite (sélectionnée, active…) : `fade(triples)`
 * avec `[nœud, id, état][]`. Une ligne dont l'état a changé depuis le dessin
 * précédent porte `data-was="<ancien état>"` le temps que la feuille de style
 * l'amène de l'ancien aspect au nouveau — une ligne neuve ne connaîtrait pas
 * de transition CSS.
 */
export const stateFade = () => {
  let states = new Map();
  return (triples) => {
    for (const [node, id, state] of triples) {
      const was = states.get(id);
      if (was !== undefined && was !== state) settle(node, 'was', was);
    }
    states = new Map(triples.map(([, id, state]) => [id, state]));
  };
};

/**
 * Clés stables des éléments d'une pile sans identifiant (étages, opérations
 * booléennes) : `keysOf(items)` à chaque synchronisation. Un élément garde sa
 * clé tant qu'il garde sa référence — ou, pile de même longueur, son rang (il
 * a été réglé) ; les autres en reçoivent une neuve. Une suppression ne décale
 * donc pas les clés des suivants.
 */
export const stableKeys = () => {
  let items = [];
  let keys = [];
  let count = 0;
  return (next) => {
    const byRef = new Map(items.map((item, i) => [item, keys[i]]));
    keys = next.map((item, i) => byRef.get(item) ?? (next.length === items.length ? keys[i] : ++count));
    items = next;
    return keys;
  };
};

/** Nom affiché d'une forme : le sien, sinon son type et son rang dans le calque, compté depuis le fond. */
export const shapeName = (layer, element, labels) =>
  element.name ?? `${labels[element.type].label} ${layer.elements.indexOf(element) + 1}`;

/**
 * Renommage en place du nom d'une ligne d'arbre : double-clic ou F2
 * remplacent le bouton par un champ ; Entrée ou quitter le champ valident,
 * Échap annule. `rename(text)` reçoit le texte saisi, rien si inchangé.
 * Le champ porte la clé de focus du nom : après la reconstruction qui suit,
 * le focus revient sur la ligne.
 */
export const inlineRename = (name, { label, rename }) => {
  const edit = () => {
    const current = name.textContent;
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'layer-name-input';
    field.value = current;
    field.maxLength = MAX_NAME_LENGTH;
    field.spellcheck = false;
    field.setAttribute('aria-label', label);
    field.dataset.focusKey = name.dataset.focusKey;
    /* Une ligne glissable volerait la sélection du texte à la souris. */
    const row = name.closest('[draggable="true"]');
    if (row) row.draggable = false;
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (row) row.draggable = true;
      field.replaceWith(name);
      name.focus();
      if (commit && field.value.trim() !== current) rename(field.value.trim());
    };
    /* Les touches restent au champ : ni raccourci global, ni navigation de l'arbre. */
    field.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
      else return;
      event.preventDefault();
    });
    field.addEventListener('blur', () => finish(true));
    name.replaceWith(field);
    field.focus();
    field.select();
  };
  name.title = 'Double-clic ou F2 pour renommer';
  name.addEventListener('dblclick', edit);
  name.addEventListener('keydown', (event) => {
    if (event.key !== 'F2') return;
    event.preventDefault();
    edit();
  });
};

/* Ligne en cours de glisser-déposer, partagée entre l'arbre des calques et la
   liste des formes : pendant `dragover`, le navigateur cache `dataTransfer`. */
let dragged = null;

const clearDrop = () => {
  for (const node of document.querySelectorAll('[data-drop]')) delete node.dataset.drop;
};

/** Poignée de glisser-déposer, posée en tête de ligne : la ligne entière se saisit. */
export const dragHandle = () => {
  const node = icon('grip', ICON_SIZE.sm);
  node.classList.add('drag-handle');
  node.title = 'Glisser pour réordonner (Alt + ↑/↓ au clavier)';
  return node;
};

/**
 * Clavier du nom d'une ligne d'arbre : Suppr ou Retour arrière suppriment
 * cette ligne-là (pas la sélection, que vise le raccourci global), ↑/↓
 * passent à la ligne voisine, Alt + ↑/↓ la font monter (vers le premier plan)
 * ou descendre — le chemin clavier du glisser-déposer. `move(delta)` reçoit
 * +1 ou -1. Les lignes voisines se cherchent dans l'ancêtre `[data-tree]`.
 */
export const rowKeys = (name, { move, remove }) =>
  name.addEventListener('keydown', (event) => {
    const arrow = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (event.key === 'Delete' || event.key === 'Backspace') remove();
    else if (arrow && event.altKey) move(event.key === 'ArrowUp' ? 1 : -1);
    else if (arrow) {
      const names = [...(name.closest('[data-tree]') ?? document).querySelectorAll('.layer-name')];
      names[names.indexOf(name) + (event.key === 'ArrowUp' ? -1 : 1)]?.focus();
    } else return;
    event.preventDefault();
  });

/**
 * Rang où poser `item` dans `list` (0 = fond) pour qu'il arrive juste avant
 * (`'before'`, au-dessus à l'écran, donc devant) ou juste après `target`. Les
 * listes s'affichent du premier plan vers le fond, à l'envers du tableau.
 */
export const dropIndex = (list, item, target, where) => {
  const at = list.filter((candidate) => candidate !== item).indexOf(target);
  return where === 'before' ? at + 1 : at;
};

/**
 * Glisser-déposer natif d'une ligne. `item` = `{ kind, id }` de la ligne
 * saisie ; `accepts(item)` dit ce que la ligne visée en fait : `'sort'` (se
 * pose avant ou après elle, selon la moitié survolée), `'into'` (entre dedans)
 * ou `null` (refusé) ; `drop(item, position)` applique le dépôt.
 *
 * ponytail: glisser natif, donc souris seulement — au clavier, Alt + ↑/↓ sur
 * le nom de la ligne (`rowKeys`) ; le tactile n'a pas de chemin.
 */
export const sortableRow = (row, item, { accepts, drop }) => {
  row.draggable = true;
  const position = (event) => {
    const mode = dragged && accepts(dragged);
    if (mode !== 'sort') return mode || null;
    const box = row.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? 'before' : 'after';
  };
  row.addEventListener('dragstart', (event) => {
    /* Une ligne de forme vit dans la card de son calque : ne pas saisir les deux. */
    event.stopPropagation();
    dragged = item;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
    }
  });
  row.addEventListener('dragend', () => {
    dragged = null;
    clearDrop();
  });
  row.addEventListener('dragover', (event) => {
    const where = position(event);
    if (!where) return;
    event.preventDefault();
    if (row.dataset.drop !== where) {
      clearDrop();
      row.dataset.drop = where;
    }
  });
  row.addEventListener('dragleave', (event) => {
    if (!row.contains(event.relatedTarget)) delete row.dataset.drop;
  });
  row.addEventListener('drop', (event) => {
    const where = position(event);
    const payload = dragged;
    dragged = null;
    clearDrop();
    if (!where) return;
    event.preventDefault();
    drop(payload, where);
  });
};
