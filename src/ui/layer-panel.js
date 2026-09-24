import { dragHandle, dropIndex, iconButton, rebuildWithFocus, reorderKeys, sortableRow, whenChanged } from './list.js';
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
  toggleVisibility,
} from '../scene.js';

/**
 * Arbre des calques. `children` : la liste des formes du calque actif, logée
 * sous sa ligne quand il est déplié. Elle est construite ailleurs, une seule
 * fois ; l'arbre ne fait que la déplacer.
 */
export const mountLayerPanel = ({ store, container, status, children = null }) => {
  /* Calque replié. Ne vaut que tant qu'il reste actif : en sélectionner un
     autre puis y revenir le rouvre. */
  let collapsedId = null;

  /* Le nom, la visibilité, l'ordre et la sélection : tout ce que montre
     l'arbre. Une forme sélectionnée change l'aspect de la ligne du calque. */
  const signature = (scene) =>
    JSON.stringify([
      scene.activeLayerId,
      scene.activeElementId !== null,
      collapsedId,
      scene.layers.map((layer) => [layer.id, layer.name, layer.visible]),
    ]);

  const rebuild = whenChanged(signature, (scene) =>
    rebuildWithFocus(container, () => {
      const list = document.createElement('ul');
      list.className = 'layer-list';

      /* Affiché du premier plan vers le fond : `layers[0]` est le fond, donc la
         liste se lit à l'envers du tableau, et « ↑ » veut bien dire « devant ». */
      for (const layer of [...scene.layers].reverse()) {
        list.append(layerRow(scene, layer));
      }

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

  const render = (scene) => {
    if (collapsedId !== scene.activeLayerId) collapsedId = null;
    rebuild(scene);
    /* La couleur change en continu pendant qu'on la règle : on la pose sur
       place plutôt que de reconstruire l'arbre. La pastille du calque prend
       celle de sa dernière forme — celle que la prochaine reprendra. */
    for (const layer of scene.layers) {
      const row = container.querySelector(`[data-layer-id="${layer.id}"]`);
      const color = layer.elements.at(-1)?.stroke;
      if (color) row?.style.setProperty('--layer-color', color);
      else row?.style.removeProperty('--layer-color');
    }
  };

  /* Choisir un calque le montre seul dans les réglages : sa forme sélectionnée,
     s'il en avait une, est relâchée. */
  const selectLayer = (id) =>
    store.apply((scene) => setActiveElement(setActiveLayer(scene, id), null));

  const layerRow = (scene, layer) => {
    const isActive = layer.id === scene.activeLayerId;
    const isOpen = isActive && collapsedId !== layer.id;

    const card = document.createElement('li');
    card.className = 'layer-card';
    /* `layer` : le calque seul est sélectionné ; `parent` : une de ses formes. */
    card.dataset.active = String(isActive);
    if (isActive) card.dataset.selected = scene.activeElementId === null ? 'layer' : 'parent';
    card.dataset.layerId = layer.id;
    card.dataset.visible = String(layer.visible);
    const row = document.createElement('div');
    row.className = 'layer-row';
    card.append(row);
    if (isOpen && children) card.append(children);

    /* Sur le calque actif, le chevron replie ou rouvre ses formes ; sur un
       autre, il le sélectionne et le déplie. */
    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'chevron';
    chevron.dataset.focusKey = `chevron-${layer.id}`;
    chevron.setAttribute('aria-label', `${isOpen ? 'Replier' : 'Déplier'} ${layer.name}`);
    chevron.setAttribute('aria-expanded', String(isOpen));
    chevron.append(icon(isOpen ? 'chevronDown' : 'chevronRight', 12));
    chevron.addEventListener('click', () => {
      if (!isActive) {
        store.apply(setActiveLayer, layer.id);
        return;
      }
      collapsedId = isOpen ? layer.id : null;
      render(store.get());
    });

    const swatch = document.createElement('span');
    swatch.className = 'layer-swatch';
    swatch.setAttribute('aria-hidden', 'true');

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'layer-name';
    name.textContent = layer.name;
    name.title = 'Double-clic pour renommer';
    name.dataset.focusKey = `name-${layer.id}`;
    name.setAttribute('aria-pressed', String(isActive));
    name.addEventListener('click', () => selectLayer(layer.id));
    name.addEventListener('dblclick', () => {
      const next = prompt('Nom du calque', layer.name);
      if (next?.trim()) store.apply(renameLayer, layer.id, next.trim());
    });
    /* La touche Suppr agit sur le calque qui a le focus, comme le bouton. */
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Delete') {
        event.preventDefault();
        remove(layer);
      }
    });

    /* Visibles au survol, au focus et sur la ligne active (voir `style.css`). */
    const actions = document.createElement('span');
    actions.className = 'row-actions';
    actions.append(
      visibilityButton(layer),
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

    reorderKeys(name, (delta) => store.apply(moveLayer, layer.id, delta));

    row.append(dragHandle(), chevron, swatch, name, actions);
    /* Un calque se range entre les autres ; une forme d'un autre calque y
       entre, au premier plan. */
    sortableRow(row, { kind: 'layer', id: layer.id }, {
      accepts: (item) => {
        if (item.kind === 'layer') return item.id === layer.id ? null : 'sort';
        /* L'arbre ne se reconstruit pas quand les formes changent : relire la scène. */
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
    return card;
  };

  const visibilityButton = (layer) => {
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

  /* Pas de confirmation : ⌘Z rend le calque et tout son contenu. */
  const remove = (layer) => {
    status.show(`« ${layer.name} » supprimé.`);
    store.apply(removeLayer, layer.id);
  };

  store.subscribe(render);
  render(store.get());
};
