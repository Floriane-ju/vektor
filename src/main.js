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

const svgRoot = document.getElementById('stage');
const hint = document.getElementById('stage-hint');
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

const hasShapes = (scene) => scene.layers.some((layer) => layer.elements.length > 0);

store.subscribe((next) => {
  render(next, svgRoot);
  hint.hidden = hasShapes(next);
});

/* L'autosave est repoussée : un glissement de slider produit des dizaines de
   notifications, une seule écriture suffit. */
store.subscribe(debounce(saveLocal));

mountHistory({ store });
const { getTool } = mountToolbar({
  store,
  svgRoot,
  container: document.getElementById('toolbar-actions'),
  shapeContainer: document.getElementById('toolbar-shapes'),
  status,
});
mountZoom({
  svgRoot,
  scroller: svgRoot.parentElement,
  container: document.getElementById('toolbar-actions'),
});
const { layerDetail, shapeDetail } = mountPropertyPanel({ store });
mountLayerPanel({
  store,
  container: document.getElementById('layer-panel'),
  status,
  detail: layerDetail,
});
mountShapeList({
  store,
  container: document.getElementById('shape-list'),
  svgRoot,
  getTool,
  status,
  detail: shapeDetail,
});

render(store.get(), svgRoot);
hint.hidden = hasShapes(store.get());
if (restored.error) {
  status.show(`Sauvegarde locale illisible, projet vierge — ${restored.error}`, 'error');
} else if (restored.scene) {
  status.show('Projet restauré depuis la sauvegarde locale.');
}
