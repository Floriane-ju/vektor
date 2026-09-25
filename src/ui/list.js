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
