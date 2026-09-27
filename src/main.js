import { createStore } from './store.js';
import { createScene, reserveIds } from './scene.js';
import { render } from './renderer-svg.js';
import { debounce, deserialize, loadLocal, saveLocal } from './persistence.js';
import example from './example.json?raw';
import { mountToolbar } from './ui/toolbar.js';
import { mountLayerPanel } from './ui/layer-panel.js';
import { mountPropertyPanel } from './ui/property-panel.js';
import { mountShapeList } from './ui/shape-list.js';
import { mountZoom } from './ui/zoom.js';
import { mountHistory } from './ui/history.js';
import { mountShortcuts } from './ui/shortcuts.js';
import { mountSettings } from './ui/settings.js';
import { mountScrub } from './ui/scrub.js';
import { mountStrokeCard } from './ui/stroke-card.js';

const svgRoot = document.getElementById('stage');
const statusNode = document.getElementById('status');

const status = {
  show(message, tone = 'info') {
    statusNode.textContent = message;
    statusNode.dataset.tone = tone;
  },
};

const restored = loadLocal();
/* Premier lancement (aucune sauvegarde) : dessin d'exemple. Une sauvegarde
   illisible garde le projet vierge ; une scène vidée est sauvegardée, donc
   reste vide. */
const firstRun = !restored.scene && !restored.error;
const scene = restored.scene ?? (firstRun ? deserialize(example) : createScene());
reserveIds(scene.layers);

const store = createStore(scene);

store.subscribe((next) => render(next, svgRoot));

/* L'autosave est repoussée : un glissement de slider produit des dizaines de
   notifications, une seule écriture suffit. Une sélection seule (mêmes
   `layers`) n'écrit pas ; la fermeture de l'onglet vide l'attente. */
let savedLayers = scene.layers;
let saveFailed = false;
const autosave = debounce((next) => {
  const ok = saveLocal(next);
  if (ok === !saveFailed) return;
  saveFailed = !ok;
  if (ok) status.show('Sauvegarde locale rétablie.');
  else status.show('Sauvegarde locale impossible (stockage plein ou refusé) — exporter le projet (Exporter → JSON) pour ne rien perdre.', 'error');
});
store.subscribe((next) => {
  if (next.layers === savedLayers) return;
  savedLayers = next.layers;
  autosave(next);
});
window.addEventListener('pagehide', autosave.flush);

const actions = document.getElementById('toolbar-actions');
const viewControls = document.getElementById('view-controls');
const shapeList = document.getElementById('shape-list');

/* Ordre de montage = ordre d'affichage dans les pastilles. */
mountHistory({ store, container: actions });
mountScrub();
mountShortcuts({ store, container: actions, status });
const view = mountZoom({ svgRoot, container: viewControls });
const { snap } = mountSettings({ store, svgRoot, container: viewControls, view });
const { getTool } = mountToolbar({
  store,
  svgRoot,
  snap,
  container: actions,
  shapeContainer: document.getElementById('toolbar-shapes'),
  status,
});
mountPropertyPanel({ store, container: document.getElementById('inspector') });
mountStrokeCard({ store, container: document.getElementById('stroke-card') });
mountShapeList({ store, container: shapeList, svgRoot, getTool, status });
/* L'arbre loge la liste des formes sous le calque actif déplié. */
mountLayerPanel({
  store,
  container: document.getElementById('layer-panel'),
  status,
  children: shapeList,
});

render(store.get(), svgRoot);
view.fit();
if (restored.error) {
  status.show(`Sauvegarde locale illisible, projet vierge — ${restored.error}`, 'error');
} else if (restored.scene) {
  status.show('Projet restauré depuis la sauvegarde locale.');
}
