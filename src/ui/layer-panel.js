import { iconButton, rebuildWithFocus, whenChanged } from './list.js';
import { icon } from './icons.js';
import {
  addLayer,
  duplicateLayer,
  moveLayer,
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
  /* Hors de la scène : c'est un état d'interface, pas une donnée du projet —
     il ne doit ni partir à l'export ni survivre à un rechargement. */
  let pendingDeleteId = null;
  /* Calque replié. Ne vaut que tant qu'il reste actif : en sélectionner un
     autre puis y revenir le rouvre. */
  let collapsedId = null;

  /* Le nom, la visibilité, l'ordre et la sélection : tout ce que montre
     l'arbre. Une forme sélectionnée change l'aspect de la ligne du calque. */
  const signature = (scene) =>
    JSON.stringify([
      scene.activeLayerId,
      scene.activeElementId !== null,
      pendingDeleteId,
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
       place plutôt que de reconstruire l'arbre. */
    for (const layer of scene.layers) {
      container
        .querySelector(`[data-layer-id="${layer.id}"]`)
        ?.style.setProperty('--layer-color', layer.stroke);
    }
  };

  /* Choisir un calque le montre seul dans les réglages : sa forme sélectionnée,
     s'il en avait une, est relâchée. */
  const selectLayer = (id) =>
    store.apply((scene) => setActiveElement(setActiveLayer(scene, id), null));

  const layerRow = (scene, layer) => {
    const index = scene.layers.indexOf(layer);
    const isActive = layer.id === scene.activeLayerId;
    const isPending = layer.id === pendingDeleteId;
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
        askDelete(layer);
      }
    });

    /* Visibles au survol, au focus et sur la ligne active (voir `style.css`). */
    const actions = document.createElement('span');
    actions.className = 'row-actions';
    actions.append(
      iconButton({
        label: layer.visible ? `Masquer ${layer.name}` : `Afficher ${layer.name}`,
        text: layer.visible ? '◉' : '○',
        focusKey: `visible-${layer.id}`,
        pressed: layer.visible,
        onClick: () => store.apply(toggleVisibility, layer.id),
      }),
      iconButton({
        label: `Dupliquer ${layer.name}`,
        text: '⧉',
        focusKey: `duplicate-${layer.id}`,
        onClick: () => store.apply(duplicateLayer, layer.id),
      }),
      iconButton({
        label: `Monter ${layer.name}`,
        text: '↑',
        focusKey: `up-${layer.id}`,
        disabled: index === scene.layers.length - 1,
        onClick: () => store.apply(moveLayer, layer.id, 1),
      }),
      iconButton({
        label: `Descendre ${layer.name}`,
        text: '↓',
        focusKey: `down-${layer.id}`,
        disabled: index === 0,
        onClick: () => store.apply(moveLayer, layer.id, -1),
      }),
      isPending
        ? iconButton({
            label: `Confirmer la suppression de ${layer.name}`,
            text: 'Sûr ?',
            focusKey: `delete-${layer.id}`,
            danger: true,
            onClick: () => confirmDelete(layer),
          })
        : iconButton({
            label: `Supprimer ${layer.name}`,
            text: '×',
            focusKey: `delete-${layer.id}`,
            danger: true,
            onClick: () => askDelete(layer),
          }),
    );
    if (isPending) actions.dataset.pending = '';

    row.append(chevron, swatch, name, actions);
    return card;
  };

  const askDelete = (layer) => {
    pendingDeleteId = layer.id;
    status.show(`Supprimer « ${layer.name} » ? Confirmer dans le panneau.`, 'error');
    render(store.get());
  };

  const confirmDelete = (layer) => {
    pendingDeleteId = null;
    status.show(`« ${layer.name} » supprimé.`);
    store.apply(removeLayer, layer.id);
  };

  store.subscribe(render);
  render(store.get());
};
