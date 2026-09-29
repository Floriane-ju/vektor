import { createScene, MAX_NAME_LENGTH, reserveIds } from '../scene.js';
import { drawingName, loadLocal, removeLocal, saveDrawings, sceneKey } from '../persistence.js';
import { icon, ICON_SIZE } from './icons.js';
import { pillButton } from './fields.js';
import { inlineRename, presence, rebuildWithFocus } from './list.js';

const hasShapes = (scene) => scene?.layers.some((layer) => layer.elements.length > 0) ?? false;

/**
 * Onglets de dessins : chaque onglet est un document à part entière — sa
 * scène, son historique d'annulation, sa clé de sauvegarde locale. Un seul
 * store : changer d'onglet échange sa scène et son historique (`store.swap`).
 *
 * `beforeSwitch(scene)` est appelé avant l'échange (vider l'autosave du
 * dessin quitté, recaler sa référence) ; `afterSwitch()` après (recadrer).
 *
 * @returns {{ activeKey: () => string }} clé de sauvegarde du dessin affiché.
 */
export const mountDrawingTabs = ({ store, container, status, drawings: initial, beforeSwitch, afterSwitch }) => {
  let drawings = initial;
  /* Documents ouverts puis quittés pendant la session, avec leur historique.
     ponytail: tous gardés en mémoire, libérer les plus anciens si beaucoup d'onglets pèsent. */
  const parked = new Map();

  const update = (next) => {
    drawings = next;
    if (!saveDrawings(drawings)) {
      status.show('Liste des dessins non enregistrée — stockage local plein ou refusé.', 'error');
    }
    draw();
  };

  const open = (id) => {
    if (parked.has(id)) return parked.get(id);
    const restored = loadLocal(sceneKey(id));
    if (restored.error) status.show(`Sauvegarde de ce dessin illisible, dessin vierge — ${restored.error}`, 'error');
    const scene = restored.scene ?? createScene();
    reserveIds(scene.layers);
    return { state: scene };
  };

  const activate = (id, doc = open(id)) => {
    if (id === drawings.active) return;
    beforeSwitch(doc.state);
    parked.delete(id);
    const left = drawings.active;
    update({ ...drawings, active: id });
    parked.set(left, store.swap(doc));
    afterSwitch();
  };

  const create = () => {
    const number = Math.max(0, ...drawings.tabs.map((tab) => Number(tab.id.slice(1)))) + 1;
    const id = `D${number}`;
    /* Pas de `update` ici : `activate` redessine, une seule fois — un second
       dessin recréerait l'onglet sans son animation d'entrée. */
    drawings = { ...drawings, tabs: [...drawings.tabs, { id, name: drawingName(id) }] };
    activate(id, { state: createScene() });
  };

  const close = (id) => {
    const { tabs } = drawings;
    if (tabs.length < 2) return;
    const scene = id === drawings.active ? store.get() : (parked.get(id)?.state ?? loadLocal(sceneKey(id)).scene);
    const tab = tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    if (hasShapes(scene) && !window.confirm(`Fermer « ${tab.name} » ? Le dessin sera supprimé.`)) return;
    if (id === drawings.active) {
      const index = tabs.findIndex((tab) => tab.id === id);
      activate(tabs[index + 1]?.id ?? tabs[index - 1].id);
    }
    parked.delete(id);
    removeLocal(sceneKey(id));
    update({ ...drawings, tabs: drawings.tabs.filter((tab) => tab.id !== id) });
  };

  const rename = (id, text) => {
    const name = text.slice(0, MAX_NAME_LENGTH);
    if (!name) return;
    update({ ...drawings, tabs: drawings.tabs.map((tab) => (tab.id === id ? { ...tab, name } : tab)) });
  };

  const tabNode = (tab) => {
    const isActive = tab.id === drawings.active;
    const wrap = document.createElement('div');
    wrap.className = 'drawing-tab';
    wrap.setAttribute('role', 'presentation');
    wrap.dataset.active = String(isActive);

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'drawing-tab-name';
    name.setAttribute('role', 'tab');
    name.setAttribute('aria-selected', String(isActive));
    name.dataset.focusKey = `drawing-${tab.id}`;
    name.textContent = tab.name;
    name.addEventListener('click', () => activate(tab.id));
    inlineRename(name, { label: `Nom de ${tab.name}`, rename: (text) => rename(tab.id, text) });
    wrap.append(name);

    if (drawings.tabs.length > 1) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn drawing-tab-close';
      remove.setAttribute('aria-label', `Fermer ${tab.name}`);
      remove.title = 'Fermer le dessin';
      remove.append(icon('close', ICON_SIZE.md));
      remove.addEventListener('click', () => close(tab.id));
      wrap.append(remove);
    }
    return wrap;
  };

  const mark = presence();
  const draw = () => {
    let tabs = [];
    rebuildWithFocus(container, () => {
      const add = pillButton([icon('plus', ICON_SIZE.md), 'Nouveau'], { className: 'drawing-new', onClick: create });
      add.dataset.focusKey = 'drawing-new';
      tabs = drawings.tabs.map(tabNode);
      container.append(...tabs, add);
      return add;
    });
    mark(tabs.map((node, i) => [node, drawings.tabs[i].id]), null, container);
  };

  container.setAttribute('role', 'tablist');
  container.setAttribute('aria-label', 'Dessins');
  draw();
  return { activeKey: () => sceneKey(drawings.active) };
};
