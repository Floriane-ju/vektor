import { dragHandle, dropIndex, iconButton, inertGhost, inlineRename, presence, rebuildWithFocus, removeAfterAnimation, settle, stateFade, rowKeys, sortableRow, whenChanged } from './list.js';
import { icon, ICON_SIZE } from './icons.js';
import {
  addLayer,
  duplicateLayer,
  moveLayer,
  placeElement,
  placeLayer,
  removeLayer,
  renameLayer,
  setActiveElement,
  setActiveLayer,
  activePlane,
  copyTotal,
  isSuspended,
  togglePlane,
  toggleLock,
  toggleVisibility,
} from '../scene.js';

/* Choisir un calque le montre seul dans les réglages : sa forme sélectionnée,
   s'il en avait une, est relâchée. */
const selectLayer = (store, id) => store.apply((scene) => setActiveElement(setActiveLayer(scene, id), null));

const visibilityButton = (store, layer) => {
  const button = iconButton({
    label: layer.visible ? `Masquer ${layer.name}` : `Afficher ${layer.name}`,
    icon: layer.visible ? 'eye' : 'eyeOff',
    focusKey: `visible-${layer.id}`,
    pressed: layer.visible,
    onClick: () => store.apply(toggleVisibility, layer.id),
  });
  return button;
};

/* Calque verrouillé : ses formes ne se saisissent plus sur le plan. */
const lockButton = (store, layer) => {
  const locked = layer.locked === true;
  const button = iconButton({
    label: locked ? `Déverrouiller ${layer.name}` : `Verrouiller ${layer.name}`,
    icon: locked ? 'lock' : 'lockOff',
    focusKey: `lock-${layer.id}`,
    pressed: locked,
    onClick: () => store.apply(toggleLock, layer.id),
  });
  return button;
};

/* Plan 3D : allumé, le cube ; éteint, il garde ses réglages pour le retour. */
const planeButton = (store, layer) => {
  const on = activePlane(layer) !== null;
  const button = iconButton({
    label: on ? `Mettre ${layer.name} à plat` : `Passer ${layer.name} en 3D`,
    icon: on ? 'cube' : 'cubeOff',
    focusKey: `plane-${layer.id}`,
    pressed: on,
    onClick: () => store.apply(togglePlane, layer.id),
  });
  return button;
};

/* Trop de copies : le calque n'est plus dessiné, l'arbre le dit. */
const suspendedMark = (layer) => {
  const mark = icon('warning', ICON_SIZE.md);
  mark.classList.add('suspended-mark');
  mark.removeAttribute('aria-hidden');
  mark.setAttribute('role', 'img');
  const text = `Rendu suspendu : ${copyTotal(layer).toLocaleString('fr-FR')} copies`;
  mark.title = text;
  mark.setAttribute('aria-label', text);
  return mark;
};

/* Visibles au survol, au focus et sur la ligne active (voir `style.css`). */
const layerActions = ({ store, remove }, layer) => {
  const actions = document.createElement('span');
  actions.className = 'row-actions';
  actions.append(
    planeButton(store, layer),
    visibilityButton(store, layer),
    lockButton(store, layer),
    iconButton({
      label: `Dupliquer ${layer.name}`,
      icon: 'duplicate',
      focusKey: `duplicate-${layer.id}`,
      onClick: () => store.apply(duplicateLayer, layer.id),
    }),
    iconButton({
      label: `Supprimer ${layer.name}`,
      icon: 'close',
      focusKey: `delete-${layer.id}`,
      danger: true,
      onClick: () => remove(layer),
    }),
  );
  return actions;
};

/* Sur le calque actif, le chevron replie ou rouvre ses formes ; sur un
   autre, il le sélectionne et le déplie. */
const layerChevron = ({ store, toggle }, layer, isActive, isOpen) => {
  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = 'chevron';
  chevron.dataset.focusKey = `chevron-${layer.id}`;
  chevron.setAttribute('aria-label', `${isOpen ? 'Replier' : 'Déplier'} ${layer.name}`);
  chevron.setAttribute('aria-expanded', String(isOpen));
  chevron.append(icon(isOpen ? 'chevronDown' : 'chevronRight', ICON_SIZE.md));
  chevron.addEventListener('click', () => {
    if (isActive) toggle(layer.id, isOpen);
    else store.apply(setActiveLayer, layer.id);
  });
  return chevron;
};

const layerName = (store, layer, isActive) => {
  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'tree-name';
  name.textContent = layer.name;
  name.dataset.focusKey = `name-${layer.id}`;
  name.setAttribute('aria-pressed', String(isActive));
  name.addEventListener('click', () => selectLayer(store, layer.id));
  /* Un calque a toujours un nom : vider le champ annule. */
  inlineRename(name, {
    label: `Nom de ${layer.name}`,
    rename: (text) => text && store.apply(renameLayer, layer.id, text),
  });
  return name;
};

/* Un calque se range entre les autres ; une forme d'un autre calque y entre,
   au premier plan. L'arbre ne se reconstruit pas quand les formes changent :
   relire la scène. */
const sortLayer = (store, row, layer) =>
  sortableRow(row, { kind: 'layer', id: layer.id }, {
    accepts: (item) => {
      if (item.kind === 'layer') return item.id === layer.id ? null : 'sort';
      const current = store.get().layers.find((candidate) => candidate.id === layer.id);
      return current?.elements.some((element) => element.id === item.id) ? null : 'into';
    },
    drop: (item, where) => {
      const current = store.get();
      const target = current.layers.find((candidate) => candidate.id === layer.id);
      if (item.kind === 'shape') {
        store.apply(placeElement, item.id, layer.id, target.elements.length);
        return;
      }
      const dragged = current.layers.find((candidate) => candidate.id === item.id);
      store.apply(placeLayer, item.id, dropIndex(current.layers, dragged, target, where));
    },
  });

const fold = (content) => {
  const node = document.createElement('div');
  node.className = 'layer-fold';
  node.append(content);
  return node;
};

/* Copie inerte de la liste des formes quittée, repliée dans son calque. */
const closingFold = (children) => {
  const copy = inertGhost(children.cloneNode(true));
  copy.removeAttribute('id');
  const node = fold(copy);
  node.dataset.close = '';
  return node;
};

/* Ligne d'un calque. `ctx` = `{ store, children, collapsedId, toggle, remove }`. */
const layerRow = (ctx, scene, layer) => {
  const { store, children } = ctx;
  const isActive = layer.id === scene.activeLayerId;
  const isOpen = isActive && ctx.collapsedId() !== layer.id;

  const card = document.createElement('li');
  card.className = 'tree-item';
  /* `layer` : le calque seul est sélectionné ; `parent` : une de ses formes. */
  card.dataset.active = String(isActive);
  if (isActive) card.dataset.selected = scene.activeElementId === null ? 'layer' : 'parent';
  card.dataset.layerId = layer.id;
  card.dataset.visible = String(layer.visible);
  card.dataset.locked = String(layer.locked === true);
  card.dataset.plane = String(activePlane(layer) !== null);
  const row = document.createElement('div');
  row.className = 'tree-row';
  card.append(row);
  /* Le pli qui loge la liste des formes : il s'ouvre et se referme en hauteur
     (voir `style.css`, `.layer-fold`). */
  if (isOpen && children) card.append(fold(children));

  const name = layerName(store, layer, isActive);
  rowKeys(name, { move: (delta) => store.apply(moveLayer, layer.id, delta), remove: () => ctx.remove(layer) });
  row.append(dragHandle(), layerChevron(ctx, layer, isActive, isOpen), name);
  if (isSuspended(layer)) row.append(suspendedMark(layer));
  row.append(layerActions(ctx, layer));
  sortLayer(store, row, layer);
  return card;
};

/* Le nom, la visibilité, l'ordre et la sélection : tout ce que montre
   l'arbre. Une forme sélectionnée change l'aspect de la ligne du calque. */
const signature = (scene, collapsedId) =>
  JSON.stringify([
    scene.activeLayerId,
    scene.activeElementId !== null,
    collapsedId,
    scene.layers.map((layer) => [layer.id, layer.name, layer.visible, layer.locked === true, activePlane(layer) !== null, isSuspended(layer) && copyTotal(layer)]),
  ]);

/**
 * Arbre des calques. `children` : la liste des formes du calque actif, logée
 * sous sa ligne quand il est déplié. Elle est construite ailleurs, une seule
 * fois ; l'arbre ne fait que la déplacer.
 */
export const mountLayerPanel = ({ store, container, status, children = null }) => {
  /* Racine de l'arbre calques → formes, parcouru par ↑/↓ (`rowKeys`). */
  container.dataset.tree = '';
  /* Calque replié. Ne vaut que tant qu'il reste actif : en sélectionner un
     autre puis y revenir le rouvre. */
  let collapsedId = null;

  const ctx = {
    store,
    children,
    collapsedId: () => collapsedId,
    toggle: (id, isOpen) => {
      collapsedId = isOpen ? id : null;
      render(store.get());
    },
    /* Pas de confirmation : ⌘Z rend le calque et tout son contenu. */
    remove: (layer) => {
      status.show(`« ${layer.name} » supprimé.`);
      store.apply(removeLayer, layer.id);
    },
  };

  const mark = presence();
  const fade = stateFade();
  /* Calque dont le pli est ouvert ; `undefined` avant le premier dessin, qui
     ne s'anime pas. */
  let openId;
  const rebuild = whenChanged(
    (scene) => signature(scene, collapsedId),
    (scene) => {
      /* La liste des formes n'a pas encore été redessinée (l'arbre s'abonne
         avant elle) : c'est encore celle du calque qu'on quitte. */
      const nextOpen = scene.layers.some((layer) => layer.id === scene.activeLayerId) && collapsedId !== scene.activeLayerId
        ? scene.activeLayerId
        : null;
      const closing = openId && openId !== nextOpen && children ? closingFold(children) : null;
      rebuildWithFocus(container, () => {
        const list = document.createElement('ul');
        list.className = 'layer-list';
        /* Affiché du premier plan vers le fond : `layers[0]` est le fond, donc la
           liste se lit à l'envers du tableau, et « ↑ » veut bien dire « devant ». */
        const cards = [...scene.layers].reverse().map((layer) => layerRow(ctx, scene, layer));
        list.append(...cards);

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'add-layer';
        add.append(icon('plus', ICON_SIZE.md), 'Ajouter un calque');
        add.dataset.focusKey = 'add-layer';
        add.addEventListener('click', () => store.apply(addLayer));

        if (scene.layers.length === 0) {
          const note = document.createElement('p');
          note.className = 'empty-note';
          note.textContent = 'Aucun calque.';
          container.append(note);
        }

        container.append(list, add);
        mark(cards.map((card) => [card, card.dataset.layerId]), null, list);
        fade(cards.map((card) => [card, card.dataset.layerId, card.dataset.selected ?? 'none']));
        if (openId !== undefined && openId !== nextOpen) {
          const opened = list.querySelector(':scope > .tree-item > .layer-fold');
          if (opened) settle(opened, 'open');
          const left = closing && cards.find((card) => card.dataset.layerId === openId);
          if (left) {
            left.append(closing);
            removeAfterAnimation(closing);
          }
        }
        openId = nextOpen;
        return add;
      });
    },
  );

  function render(scene) {
    if (collapsedId !== scene.activeLayerId) collapsedId = null;
    rebuild(scene);
  }

  store.subscribe(render);
  render(store.get());
};
