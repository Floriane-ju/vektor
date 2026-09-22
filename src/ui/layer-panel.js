import { iconButton, rebuildWithFocus, whenChanged } from './list.js';
import {
  addLayer,
  moveLayer,
  removeLayer,
  renameLayer,
  setActiveLayer,
  toggleVisibility,
} from '../scene.js';

/**
 * `detail` : les réglages du calque actif, logés dans sa card. Ils sont
 * construits ailleurs, une seule fois ; la liste ne fait que les déplacer.
 */
export const mountLayerPanel = ({ store, container, status, detail = null }) => {
  /* Hors de la scène : c'est un état d'interface, pas une donnée du projet —
     il ne doit ni partir à l'export ni survivre à un rechargement. */
  let pendingDeleteId = null;

  /* Le nom, la visibilité, l'ordre et la sélection : tout ce que montrent les
     cards. Les réglages du calque n'y figurent pas, ils se mettent à jour sur
     place. */
  const signature = (scene) =>
    JSON.stringify([
      scene.activeLayerId,
      pendingDeleteId,
      scene.layers.map((layer) => [layer.id, layer.name, layer.visible]),
    ]);

  const render = whenChanged(signature, (scene) =>
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

  const layerRow = (scene, layer) => {
    const index = scene.layers.indexOf(layer);
    const isActive = layer.id === scene.activeLayerId;
    const isPending = layer.id === pendingDeleteId;

    const card = document.createElement('li');
    card.className = 'layer-card';
    card.dataset.active = String(isActive);
    const row = document.createElement('div');
    row.className = 'layer-row';
    card.append(row);
    if (isActive && detail) card.append(detail);

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'layer-name';
    name.textContent = layer.name;
    name.dataset.focusKey = `name-${layer.id}`;
    name.setAttribute('aria-pressed', String(isActive));
    name.addEventListener('click', () => store.apply(setActiveLayer, layer.id));
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

    row.append(
      iconButton({
        label: layer.visible ? `Masquer ${layer.name}` : `Afficher ${layer.name}`,
        text: layer.visible ? '◉' : '○',
        focusKey: `visible-${layer.id}`,
        pressed: layer.visible,
        onClick: () => store.apply(toggleVisibility, layer.id),
      }),
      name,
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
