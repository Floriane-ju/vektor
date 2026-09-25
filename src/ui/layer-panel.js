import { dragHandle, dropIndex, iconButton, inlineRename, rebuildWithFocus, rowKeys, sortableRow, whenChanged } from './list.js';
import { icon } from './icons.js';
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
  togglePlane,
  toggleVisibility,
} from '../scene.js';

/* Choisir un calque le montre seul dans les réglages : sa forme sélectionnée,
   s'il en avait une, est relâchée. */
const selectLayer = (store, id) => store.apply((scene) => setActiveElement(setActiveLayer(scene, id), null));

const visibilityButton = (store, layer) => {
  const button = iconButton({
    label: layer.visible ? `Masquer ${layer.name}` : `Afficher ${layer.name}`,
    text: '',
    focusKey: `visible-${layer.id}`,
    pressed: layer.visible,
    onClick: () => store.apply(toggleVisibility, layer.id),
  });
  button.append(icon(layer.visible ? 'eye' : 'eyeOff', 14));
  return button;
};

/* Plan 3D : allumé, le cube ; éteint, il garde ses réglages pour le retour. */
const planeButton = (store, layer) => {
  const on = activePlane(layer) !== null;
  const button = iconButton({
    label: on ? `Mettre ${layer.name} à plat` : `Passer ${layer.name} en 3D`,
    text: '',
    focusKey: `plane-${layer.id}`,
    pressed: on,
    onClick: () => store.apply(togglePlane, layer.id),
  });
  button.append(icon(on ? 'cube' : 'cubeOff', 14));
  return button;
};

/* Visibles au survol, au focus et sur la ligne active (voir `style.css`). */
const layerActions = ({ store, remove }, layer) => {
  const actions = document.createElement('span');
  actions.className = 'row-actions';
  actions.append(
    planeButton(store, layer),
    visibilityButton(store, layer),
    iconButton({
      label: `Dupliquer ${layer.name}`,
      text: '⧉',
      focusKey: `duplicate-${layer.id}`,
      onClick: () => store.apply(duplicateLayer, layer.id),
    }),
    iconButton({
      label: `Supprimer ${layer.name}`,
      text: '×',
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
  chevron.append(icon(isOpen ? 'chevronDown' : 'chevronRight', 12));
  chevron.addEventListener('click', () => {
    if (isActive) toggle(layer.id, isOpen);
    else store.apply(setActiveLayer, layer.id);
  });
  return chevron;
};

const layerName = (store, layer, isActive) => {
  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'layer-name';
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

/* Ligne d'un calque. `ctx` = `{ store, children, collapsedId, toggle, remove }`. */
const layerRow = (ctx, scene, layer) => {
  const { store, children } = ctx;
  const isActive = layer.id === scene.activeLayerId;
  const isOpen = isActive && ctx.collapsedId() !== layer.id;

  const card = document.createElement('li');
  card.className = 'layer-card';
  /* `layer` : le calque seul est sélectionné ; `parent` : une de ses formes. */
  card.dataset.active = String(isActive);
  if (isActive) card.dataset.selected = scene.activeElementId === null ? 'layer' : 'parent';
  card.dataset.layerId = layer.id;
  card.dataset.visible = String(layer.visible);
  card.dataset.plane = String(activePlane(layer) !== null);
  const row = document.createElement('div');
  row.className = 'layer-row';
  card.append(row);
  if (isOpen && children) card.append(children);

  const name = layerName(store, layer, isActive);
  rowKeys(name, { move: (delta) => store.apply(moveLayer, layer.id, delta), remove: () => ctx.remove(layer) });
  row.append(dragHandle(), layerChevron(ctx, layer, isActive, isOpen), name, layerActions(ctx, layer));
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
    scene.layers.map((layer) => [layer.id, layer.name, layer.visible, activePlane(layer) !== null]),
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

  const rebuild = whenChanged(
    (scene) => signature(scene, collapsedId),
    (scene) =>
      rebuildWithFocus(container, () => {
        const list = document.createElement('ul');
        list.className = 'layer-list';
        /* Affiché du premier plan vers le fond : `layers[0]` est le fond, donc la
           liste se lit à l'envers du tableau, et « ↑ » veut bien dire « devant ». */
        list.append(...[...scene.layers].reverse().map((layer) => layerRow(ctx, scene, layer)));

        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'add-layer';
        add.textContent = '+ Ajouter un calque';
        add.dataset.focusKey = 'add-layer';
        add.addEventListener('click', () => store.apply(addLayer));

        if (scene.layers.length === 0) {
          const note = document.createElement('p');
          note.className = 'empty-note';
          note.textContent = 'Aucun calque.';
          container.append(note);
        }

        container.append(list, add);
        return add;
      }),
  );

  function render(scene) {
    if (collapsedId !== scene.activeLayerId) collapsedId = null;
    rebuild(scene);
  }

  store.subscribe(render);
  render(store.get());
};
