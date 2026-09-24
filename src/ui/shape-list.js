import {
  addElement,
  DEFAULT_SHAPE,
  duplicateElement,
  getActiveLayer,
  moveElement,
  placeElement,
  removeElement,
  setActiveElement,
  SHAPES,
} from '../scene.js';
import { clearHover, shapePreview, showHover } from '../renderer-svg.js';
import { dragHandle, dropIndex, iconButton, rebuildWithFocus, reorderKeys, shapeName, sortableRow, whenChanged } from './list.js';
import { icon } from './icons.js';
import { DUPLICATE_OFFSET } from './shortcuts.js';

/* Délai avant de rendre l'accent à la sélection quand le pointeur quitte une
   card, en millisecondes : assez pour traverser l'interstice entre deux. */
const HOVER_LEAVE_DELAY = 120;

/* Côté de l'aperçu d'une forme dans la liste, en pixels. */
const GLYPH_SIZE = 18;

/**
 * Forme sous laquelle chaque outil booléen se range : la première, du premier plan
 * vers le fond, qui l'emploie. Un seul niveau — une forme déjà rangée sous une
 * autre ne reçoit pas d'outil, et un outil ne se range qu'une fois — pour
 * qu'un booléen croisé ne fasse disparaître aucune ligne.
 */
const booleanParents = (displayed) => {
  const ids = new Set(displayed.map((element) => element.id));
  const parents = new Map();
  for (const element of displayed) {
    for (const { with: target } of element.booleans) {
      if (!ids.has(target) || target === element.id || parents.has(target) || parents.has(element.id)) continue;
      if ([...parents.values()].includes(target)) continue;
      parents.set(target, element.id);
    }
  }
  return parents;
};

/**
 * Liste des formes du calque actif, logée par l'arbre sous sa ligne.
 *
 * Un calque porte plusieurs formes et le modificateur s'applique au groupe : il
 * faut donc pouvoir désigner celle qu'on édite, la réordonner dans le calque et
 * la supprimer. Ses réglages vivent dans le panneau de droite.
 */
export const mountShapeList = ({
  store,
  container,
  svgRoot,
  getTool = () => DEFAULT_SHAPE,
  status,
}) => {
  /* Forme dont la ligne est survolée. Gardée ici parce que chaque rendu du
     stage efface le surlignage : un clic sur la ligne le ferait disparaître
     sous le pointeur. Ce module s'abonne après le renderer, il le repose. */
  let hoveredId = null;

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
      layer?.elements.map((element) => [element.id, element.type, element.booleans.map((step) => step.with)]) ?? [],
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

      add.className = 'add-shape';
      if (!layer || layer.elements.length === 0) {
        container.append(add);
        return add;
      }

      const list = document.createElement('ul');
      list.className = 'layer-list';
      /* Affiché du premier plan vers le fond, comme le panneau calques : la
         liste se lit à l'envers du tableau, et « ↑ » veut dire « devant ». */
      const displayed = [...layer.elements].reverse();
      const parents = booleanParents(displayed);
      for (const element of displayed) {
        if (!parents.has(element.id)) list.append(shapeRow(layer, element, scene.activeElementId, displayed, parents));
      }

      container.append(list, add);
      return add;
    }),
  );

  const render = (scene) => {
    if (hoveredId) highlight(hoveredId);
    rebuild(scene);
    /* Couleur et géométrie changent en continu pendant qu'on les règle : on
       redessine l'aperçu sur place plutôt que de reconstruire la liste.
       ponytail: tous les aperçus du calque à chaque rendu ; ne redessiner que
       la forme modifiée si un calque très chargé rame. */
    for (const element of getActiveLayer(scene)?.elements ?? []) {
      const glyph = container.querySelector(`[data-element-id="${element.id}"] > .layer-row > .shape-glyph`);
      if (!glyph) continue;
      glyph.style.setProperty('--shape-color', element.stroke);
      const preview = shapePreview(element, GLYPH_SIZE);
      if (preview) glyph.replaceChildren(preview);
    }
  };

  const shapeRow = (layer, element, activeElementId, displayed, parents) => {
    const isActive = element.id === activeElementId;

    const card = document.createElement('li');
    card.className = 'layer-card';
    card.dataset.active = String(isActive);
    card.dataset.elementId = element.id;
    card.addEventListener('pointerenter', () => highlight(element.id));
    /* Revenir d'un outil imbriqué sur sa forme ne rentre pas dans la card :
       seul `pointerover` le dit. */
    card.addEventListener('pointerover', (event) => {
      if (event.target.closest('li') === card && hoveredId !== element.id) highlight(element.id);
    });
    card.addEventListener('pointerleave', () => {
      leaveTimer = setTimeout(() => highlight(null), HOVER_LEAVE_DELAY);
    });
    /* Même ligne que l'arbre des calques, sans la bascule de visibilité : une
       forme se masque en la supprimant ou en masquant son calque. */
    const row = document.createElement('div');
    row.className = 'layer-row is-shape';
    card.append(row);

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'layer-name';
    name.textContent = shapeName(layer, element, SHAPES);
    name.dataset.focusKey = `name-${element.id}`;
    name.setAttribute('aria-pressed', String(isActive));
    name.addEventListener('click', () => store.apply(setActiveElement, element.id));
    name.addEventListener('keydown', (event) => {
      if (event.key === 'Delete') {
        event.preventDefault();
        remove(element, name.textContent);
      }
    });

    const actions = document.createElement('span');
    actions.className = 'row-actions';
    reorderKeys(name, (delta) => store.apply(moveElement, element.id, delta));
    const glyph = icon(element.type, GLYPH_SIZE);
    glyph.classList.add('shape-glyph');
    row.append(dragHandle(), glyph, name, actions);
    actions.append(
      iconButton({
        label: `Dupliquer ${name.textContent}`,
        text: '⧉',
        focusKey: `duplicate-${element.id}`,
        onClick: () => store.apply(duplicateElement, element.id, DUPLICATE_OFFSET),
      }),
      iconButton({
        label: `Supprimer ${name.textContent}`,
        text: '×',
        focusKey: `delete-${element.id}`,
        danger: true,
        onClick: () => remove(element, name.textContent),
      }),
    );

    sortableRow(row, { kind: 'shape', id: element.id }, {
      accepts: (item) =>
        item.kind === 'shape' && item.id !== element.id && layer.elements.some((el) => el.id === item.id) ? 'sort' : null,
      drop: (item, where) => {
        const current = store.get().layers.find((candidate) => candidate.id === layer.id);
        const find = (id) => current.elements.find((el) => el.id === id);
        store.apply(placeElement, item.id, layer.id, dropIndex(current.elements, find(item.id), find(element.id), where));
      },
    });

    /* Outils de cette forme, rangés sous elle : ils ne se dessinent pas,
       ils la façonnent. */
    const templates = displayed.filter((candidate) => parents.get(candidate.id) === element.id);
    if (templates.length > 0) {
      const branch = document.createElement('ul');
      branch.className = 'layer-list boolean-branch';
      branch.setAttribute('aria-label', `Booléen de ${name.textContent}`);
      for (const template of templates) {
        const child = shapeRow(layer, template, activeElementId, displayed, parents);
        child.dataset.template = 'true';
        child.title = 'Outil booléen : ne se dessine pas';
        branch.append(child);
      }
      card.append(branch);
    }

    return card;
  };

  /* Pas de confirmation, comme pour le calque : ⌘Z la rend. */
  const remove = (element, label) => {
    store.apply(removeElement, element.id);
    status.show(`${label} supprimé.`);
  };

  store.subscribe(render);
  render(store.get());
};
