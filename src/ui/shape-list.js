import {
  addElement,
  DEFAULT_SHAPE,
  duplicateElement,
  getActiveLayer,
  moveElement,
  placeElement,
  removeElement,
  renameElement,
  setActiveElement,
  SHAPES,
} from '../scene.js';
import { clearHover, shapePreview, showHover } from '../renderer-svg.js';
import {
  dragHandle,
  dropIndex,
  iconButton,
  inlineRename,
  rebuildWithFocus,
  rowKeys,
  shapeName,
  sortableRow,
  whenChanged,
} from './list.js';
import { icon, ICON_SIZE } from './icons.js';
import { DUPLICATE_OFFSET } from './shortcuts.js';

/* Délai avant de rendre l'accent à la sélection quand le pointeur quitte une
   card, en millisecondes : assez pour traverser l'interstice entre deux. */
const HOVER_LEAVE_DELAY = 120;

/* Côté de l'aperçu d'une forme dans la liste. */
const GLYPH_SIZE = ICON_SIZE.glyph;

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
 * Hôte sous lequel chaque forme logée (`inside`) se range. Un seul niveau,
 * comme les outils : ni un outil booléen, ni une forme dont l'hôte est déjà
 * rangé, ni l'hôte d'une autre ne se range.
 */
const insideParents = (displayed, tools) => {
  const ids = new Set(displayed.map((element) => element.id));
  const parents = new Map();
  for (const element of displayed) {
    const host = element.inside;
    if (!host || !ids.has(host) || tools.has(element.id) || tools.has(host) || parents.has(host)) continue;
    if ([...parents.values()].includes(element.id)) continue;
    parents.set(element.id, host);
  }
  return parents;
};

/* Sous-liste rangée sous une forme : ses outils booléens, ou ses formes logées. */
const branch = (className, label, rows) => {
  const node = document.createElement('ul');
  node.className = `layer-list ${className}`;
  node.setAttribute('aria-label', label);
  node.append(...rows);
  return node;
};

/* Réordonner parmi les formes du même calque. */
const sortShape = (store, row, layer, element) =>
  sortableRow(row, { kind: 'shape', id: element.id }, {
    accepts: (item) =>
      item.kind === 'shape' && item.id !== element.id && layer.elements.some((el) => el.id === item.id) ? 'sort' : null,
    drop: (item, where) => {
      const current = store.get().layers.find((candidate) => candidate.id === layer.id);
      const find = (id) => current.elements.find((el) => el.id === id);
      store.apply(placeElement, item.id, layer.id, dropIndex(current.elements, find(item.id), find(element.id), where));
    },
  });

/* Survol d'une card : il surligne la forme sur le plan. */
const hoverCard = (ctx, card, element) => {
  card.addEventListener('pointerenter', () => ctx.highlight(element.id));
  /* Revenir d'un outil imbriqué sur sa forme ne rentre pas dans la card :
     seul `pointerover` le dit. */
  card.addEventListener('pointerover', (event) => {
    if (event.target.closest('li') === card && ctx.hoveredId() !== element.id) ctx.highlight(element.id);
  });
  card.addEventListener('pointerleave', ctx.leave);
};

/* Nom, aperçu et actions d'une forme. */
const shapeLine = ({ store, remove }, layer, element, isActive) => {
  /* Même ligne que l'arbre des calques, sans la bascule de visibilité : une
     forme se masque en la supprimant ou en masquant son calque. */
  const row = document.createElement('div');
  row.className = 'layer-row is-shape';

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'layer-name';
  name.textContent = shapeName(layer, element, SHAPES);
  name.dataset.focusKey = `name-${element.id}`;
  name.setAttribute('aria-pressed', String(isActive));
  name.addEventListener('click', () => store.apply(setActiveElement, element.id));
  /* Vider le champ rend le libellé par défaut, qui suit le rang de la forme. */
  inlineRename(name, {
    label: `Nom de ${name.textContent}`,
    rename: (text) => store.apply(renameElement, element.id, text),
  });

  const actions = document.createElement('span');
  actions.className = 'row-actions';
  rowKeys(name, {
    move: (delta) => store.apply(moveElement, element.id, delta),
    remove: () => remove(element, name.textContent),
  });
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
  sortShape(store, row, layer, element);
  return { row, label: name.textContent };
};

/**
 * Card d'une forme, avec ses outils booléens et ses formes logées rangés
 * dessous. `tree` = `{ layer, activeElementId, displayed, parents, hosts }`.
 */
const shapeRow = (ctx, tree, element) => {
  const { layer, activeElementId, displayed, parents, hosts } = tree;
  const isActive = element.id === activeElementId;
  const card = document.createElement('li');
  card.className = 'layer-card';
  card.dataset.active = String(isActive);
  card.dataset.elementId = element.id;
  hoverCard(ctx, card, element);
  const { row, label } = shapeLine(ctx, layer, element, isActive);
  card.append(row);

  /* Outils de cette forme, rangés sous elle : ils ne se dessinent pas,
     ils la façonnent. */
  const templates = displayed.filter((candidate) => parents.get(candidate.id) === element.id);
  if (templates.length > 0) {
    card.append(
      branch('boolean-branch', `Booléen de ${label}`, templates.map((template) => {
        const child = shapeRow(ctx, tree, template);
        child.dataset.template = 'true';
        child.title = 'Outil booléen : ne se dessine pas';
        return child;
      })),
    );
  }

  /* Formes logées dans celle-ci : filet pointillé, pour ne pas les confondre
     avec des outils — elles se dessinent, cachées par son volume en 3D. */
  const guests = displayed.filter((candidate) => hosts.get(candidate.id) === element.id);
  if (guests.length > 0) {
    card.append(
      branch('inside-branch', `Dans ${label}`, guests.map((guest) => {
        const child = shapeRow(ctx, tree, guest);
        child.dataset.inside = 'true';
        child.title = `À l'intérieur de ${label}`;
        return child;
      })),
    );
  }
  return card;
};

/* Les formes du calque actif, leur type et la sélection : ce que montrent
   les cards. Position et taille se règlent sur place, sans reconstruire. */
const signature = (scene) => {
  const layer = getActiveLayer(scene);
  return JSON.stringify([
    layer?.id ?? null,
    scene.activeElementId,
    layer?.elements.map((element) => [element.id, element.type, element.name, element.booleans.map((step) => step.with), element.inside]) ?? [],
  ]);
};

/* Seul chemin non-pointeur vers la création d'une forme : le glissement sur le
   plan de travail n'a pas d'équivalent clavier. La forme naît au centre du
   calque, prête à être déplacée par les champs X/Y. */
const addShapeButton = ({ store, getTool, status }, layer) => {
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = '+ Ajouter une forme';
  add.dataset.focusKey = 'add-shape';
  add.disabled = !layer;
  add.addEventListener('click', () => {
    const { x, y } = layer.center;
    store.apply(addElement, layer.id, getTool(), x, y);
    status.show(`${SHAPES[getTool()].label} ajouté au centre du calque.`);
  });
  add.className = 'add-shape';
  return add;
};

/* Couleur et géométrie changent en continu pendant qu'on les règle : on
   redessine l'aperçu sur place plutôt que de reconstruire la liste.
   ponytail: tous les aperçus du calque à chaque rendu ; ne redessiner que
   la forme modifiée si un calque très chargé rame. */
const refreshGlyphs = (container, scene) => {
  for (const element of getActiveLayer(scene)?.elements ?? []) {
    const glyph = container.querySelector(`[data-element-id="${element.id}"] > .layer-row > .shape-glyph`);
    if (!glyph) continue;
    glyph.style.setProperty('--shape-color', element.stroke);
    const preview = shapePreview(element, GLYPH_SIZE);
    if (preview) glyph.replaceChildren(preview);
  }
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

  const ctx = {
    store,
    getTool,
    status,
    highlight,
    hoveredId: () => hoveredId,
    leave: () => {
      leaveTimer = setTimeout(() => highlight(null), HOVER_LEAVE_DELAY);
    },
    /* Pas de confirmation, comme pour le calque : ⌘Z la rend. */
    remove: (element, label) => {
      store.apply(removeElement, element.id);
      status.show(`${label} supprimé.`);
    },
  };

  const rebuild = whenChanged(signature, (scene) =>
    rebuildWithFocus(container, () => {
      const layer = getActiveLayer(scene);
      const add = addShapeButton(ctx, layer);
      if (!layer || layer.elements.length === 0) {
        container.append(add);
        return add;
      }
      /* Affiché du premier plan vers le fond, comme le panneau calques : la
         liste se lit à l'envers du tableau, et « ↑ » veut dire « devant ». */
      const displayed = [...layer.elements].reverse();
      const parents = booleanParents(displayed);
      const hosts = insideParents(displayed, parents);
      const tree = { layer, activeElementId: scene.activeElementId, displayed, parents, hosts };
      const list = document.createElement('ul');
      list.className = 'layer-list';
      list.append(
        ...displayed.filter((element) => !parents.has(element.id) && !hosts.has(element.id)).map((element) => shapeRow(ctx, tree, element)),
      );
      container.append(list, add);
      return add;
    }),
  );

  const render = (scene) => {
    if (hoveredId) highlight(hoveredId);
    rebuild(scene);
    refreshGlyphs(container, scene);
  };

  store.subscribe(render);
  render(store.get());
};
