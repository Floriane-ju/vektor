import { createStore } from './store.js';
import { createScene, reserveIds } from './scene.js';
import { render } from './renderer-svg.js';
import { debounce, loadLocal, saveLocal } from './persistence.js';
import { mountToolbar } from './ui/toolbar.js';
import { mountLayerPanel } from './ui/layer-panel.js';
import { mountPropertyPanel } from './ui/property-panel.js';
import { mountShapeList } from './ui/shape-list.js';
import { mountZoom } from './ui/zoom.js';
import { mountHistory } from './ui/history.js';
import { mountShortcuts } from './ui/shortcuts.js';
import { mountSettings } from './ui/settings.js';
import { mountScrub } from './ui/scrub.js';

const svgRoot = document.getElementById('stage');
const statusNode = document.getElementById('status');

const status = {
  show(message, tone = 'info') {
    statusNode.textContent = message;
    statusNode.dataset.tone = tone;
  },
};

const restored = loadLocal();
const scene = restored.scene ?? createScene();
reserveIds(scene.layers);

const store = createStore(scene);

store.subscribe((next) => render(next, svgRoot));

/* L'autosave est repoussée : un glissement de slider produit des dizaines de
   notifications, une seule écriture suffit. */
store.subscribe(debounce(saveLocal));

const actions = document.getElementById('toolbar-actions');
const viewControls = document.getElementById('view-controls');
const shapeList = document.getElementById('shape-list');

/* Ordre de montage = ordre d'affichage dans les pastilles. */
mountHistory({ store, container: actions });
mountScrub();
mountShortcuts({ store, container: actions, status });
mountZoom({
  svgRoot,
  scroller: svgRoot.closest('.stage-wrap') ?? svgRoot.parentElement,
  container: viewControls,
});
const { snap } = mountSettings({ svgRoot, container: viewControls });
const { getTool } = mountToolbar({
  store,
  svgRoot,
  snap,
  container: actions,
  shapeContainer: document.getElementById('toolbar-shapes'),
  status,
});
mountPropertyPanel({ store, container: document.getElementById('inspector') });
mountShapeList({ store, container: shapeList, svgRoot, getTool, status });
/* L'arbre loge la liste des formes sous le calque actif déplié. */
mountLayerPanel({
  store,
  container: document.getElementById('layer-panel'),
  status,
  children: shapeList,
});

render(store.get(), svgRoot);
if (restored.error) {
  status.show(`Sauvegarde locale illisible, projet vierge — ${restored.error}`, 'error');
} else if (restored.scene) {
  status.show('Projet restauré depuis la sauvegarde locale.');
}
