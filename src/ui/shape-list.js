import {
  addElement,
  DEFAULT_SHAPE,
  getActiveLayer,
  moveElement,
  removeElement,
  setActiveElement,
  SHAPES,
} from '../scene.js';
import { clearHover, showHover } from '../renderer-svg.js';
import { iconButton, rebuildWithFocus, whenChanged } from './list.js';

/* Délai avant de rendre l'accent à la sélection quand le pointeur quitte une
   card, en millisecondes : assez pour traverser l'interstice entre deux. */
const HOVER_LEAVE_DELAY = 120;

/**
 * Liste des formes du calque actif.
 *
 * Un calque porte maintenant plusieurs formes et le modificateur s'applique au
 * groupe : il faut donc pouvoir désigner celle qu'on édite, la réordonner dans
 * le calque et la supprimer. La card de la forme sélectionnée loge `detail`,
 * ses réglages.
 */
export const mountShapeList = ({
  store,
  container,
  svgRoot,
  getTool = () => DEFAULT_SHAPE,
  status,
  detail = null,
}) => {
  /* Forme dont la ligne est survolée. Gardée ici parce que chaque rendu du
     stage efface le surlignage : un clic sur la ligne le ferait disparaître
     sous le pointeur. Ce module s'abonne après le renderer, il le repose. */
  let hoveredId = null;
  /* Forme dont la card est repliée, tant qu'elle reste sélectionnée. */
  let collapsedId = null;

  /* Sortie d'une card différée : entre deux cards, le pointeur passe par
     l'interstice et la sélection reprendrait l'accent un instant. */
  let leaveTimer = null;

  const highlight = (elementId) => {
    clearTimeout(leaveTimer);
    hoveredId = elementId;
    container.toggleAttribute('data-hovering', Boolean(elementId));
    if (!svgRoot) return;
    if (elementId) showHover(svgRoot, elementId);
    else clearHover(svgRoot);
  };

  /* Les formes du calque actif, leur type et la sélection : ce que montrent
     les cards. Position et taille se règlent sur place, sans reconstruire. */
  const signature = (scene) => {
    const layer = getActiveLayer(scene);
    return JSON.stringify([
      layer?.id ?? null,
      scene.activeElementId,
      collapsedId,
      layer?.elements.map((element) => [element.id, element.type]) ?? [],
    ]);
  };

  const rebuild = whenChanged(signature, (scene) =>
    rebuildWithFocus(container, () => {
      const layer = getActiveLayer(scene);

      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '+ Ajouter une forme';
      add.dataset.focusKey = 'add-shape';
      add.disabled = !layer;
      /* Seul chemin non-pointeur vers la création d'une forme : le glissement
         sur le plan de travail n'a pas d'équivalent clavier. La forme naît au
         centre du calque, prête à être déplacée par les champs X/Y. */
      add.addEventListener('click', () => {
        const { x, y } = layer.center;
        store.apply(addElement, layer.id, getTool(), x, y);
        status.show(`${SHAPES[getTool()].label} ajouté au centre du calque.`);
      });

      if (!layer || layer.elements.length === 0) {
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = layer ? 'Aucune forme sur ce calque.' : 'Aucun calque actif.';
        container.append(note, add);
        return add;
      }

      const list = document.createElement('ul');
      list.className = 'layer-list';
      /* Affiché du premier plan vers le fond, comme le panneau calques : la
         liste se lit à l'envers du tableau, et « ↑ » veut dire « devant ». */
      for (const element of [...layer.elements].reverse()) {
        list.append(shapeRow(layer, element, scene.activeElementId));
      }

      container.append(list, add);
      return add;
    }),
  );

  const render = (scene) => {
    if (hoveredId) highlight(hoveredId);
    if (collapsedId !== scene.activeElementId) collapsedId = null;
    rebuild(scene);
  };

  const shapeRow = (layer, element, activeElementId) => {
    const index = layer.elements.indexOf(element);
    const isActive = element.id === activeElementId;

    const card = document.createElement('li');
    card.className = 'layer-card';
    card.dataset.active = String(isActive);
    card.addEventListener('pointerenter', () => highlight(element.id));
    card.addEventListener('pointerleave', () => {
      leaveTimer = setTimeout(() => highlight(null), HOVER_LEAVE_DELAY);
    });
    /* Même ligne que le panneau calques, sans la bascule de visibilité : une
       forme se masque en la supprimant ou en masquant son calque. */
    const row = document.createElement('div');
    row.className = 'layer-row is-shape';
    card.append(row);
    const isOpen = isActive && collapsedId !== element.id;
    if (isOpen && detail) card.append(detail);

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'layer-name';
    name.textContent = `${SHAPES[element.type].label} ${index + 1}`;
    name.dataset.focusKey = `name-${element.id}`;
    name.setAttribute('aria-pressed', String(isActive));
    name.setAttribute('aria-expanded', String(isOpen));
    /* Sur la card active, l'entête replie ou rouvre les réglages. */
    name.addEventListener('click', () => {
      collapsedId = isOpen ? element.id : null;
      if (isActive) render(store.get());
      else store.apply(setActiveElement, element.id);
    });
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Delete') {
        event.preventDefault();
        remove(element, name.textContent);
      }
    });

    row.append(
      name,
      iconButton({
        label: `Monter ${name.textContent}`,
        text: '↑',
        focusKey: `up-${element.id}`,
        disabled: index === layer.elements.length - 1,
        onClick: () => store.apply(moveElement, element.id, 1),
      }),
      iconButton({
        label: `Descendre ${name.textContent}`,
        text: '↓',
        focusKey: `down-${element.id}`,
        disabled: index === 0,
        onClick: () => store.apply(moveElement, element.id, -1),
      }),
      iconButton({
        label: `Supprimer ${name.textContent}`,
        text: '×',
        focusKey: `delete-${element.id}`,
        danger: true,
        onClick: () => remove(element, name.textContent),
      }),
    );

    return card;
  };

  /* Pas de confirmation ici, contrairement au calque : une forme se redessine
     d'un glissement, alors qu'un calque emporte tout son contenu. */
  const remove = (element, label) => {
    store.apply(removeElement, element.id);
    status.show(`${label} supprimé.`);
  };

  store.subscribe(render);
  render(store.get());
};
