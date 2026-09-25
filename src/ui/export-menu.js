import { addTraces, getActiveLayer } from '../scene.js';
import { toPng, toSvgDocument } from '../renderer-svg.js';
import { deserialize, download, serialize } from '../persistence.js';
import { parseTrace } from '../path.js';
import { icon, ICON_SIZE } from './icons.js';

/* Échelles de l'export PNG, en multiples de la taille du plan. */
const PNG_SCALES = [1, 2, 4];

/* Entrée du menu Exporter : le menu se referme avant l'action, qui peut ouvrir
   un sélecteur de fichier ou un `prompt`. */
const menuItem = (label, onClick, title) => {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'menu-item';
  node.textContent = label;
  if (title) node.title = title;
  node.addEventListener('click', (event) => {
    node.closest('[popover]')?.hidePopover?.();
    onClick(event);
  });
  return node;
};

/* Exports de l'image : SVG, presse-papier, PNG à plusieurs échelles. */
const imageItems = (svgRoot, status) => {
  const exportSvg = menuItem('Exporter en SVG', (event) => {
    const trigger = event.currentTarget;
    trigger.disabled = true;
    try {
      download(toSvgDocument(svgRoot), 'vektor.svg', 'image/svg+xml');
      status.show('SVG exporté.');
    } finally {
      trigger.disabled = false;
    }
  });
  const copySvg = menuItem('Copier le SVG', async () => {
    try {
      await navigator.clipboard.writeText(toSvgDocument(svgRoot));
      status.show('SVG copié dans le presse-papier.');
    } catch {
      status.show('Presse-papier refusé par le navigateur — utiliser « Exporter en SVG ».', 'error');
    }
  });
  const pngItems = PNG_SCALES.map((scale) =>
    menuItem(`Exporter en PNG ${scale}×`, async () => {
      try {
        download(await toPng(svgRoot, scale), `vektor@${scale}x.png`, 'image/png');
        status.show(`PNG ${scale}× exporté.`);
      } catch (error) {
        status.show(`Export PNG impossible — ${error.message}`, 'error');
      }
    }),
  );
  return [exportSvg, copySvg, ...pngItems];
};

/* Projet en JSON : export, et import par un sélecteur de fichier caché. */
const projectItems = (store, status) => {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      store.set(deserialize(await file.text()));
      status.show(`« ${file.name} » importé.`);
    } catch (error) {
      status.show(`Import refusé — ${error.message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });
  const exportJson = menuItem('Exporter le projet (JSON)', () => {
    download(serialize(store.get()), 'vektor.json', 'application/json');
    status.show('Projet exporté.');
  });
  const importJson = menuItem('Importer un projet (JSON)…', () => fileInput.click());
  return { items: [exportJson, importJson], fileInput };
};

/* ponytail: `prompt` natif — un champ dédié le jour où l'on veut prévisualiser
   avant d'importer. */
const pasteTraceItem = (store, status) =>
  menuItem(
    'Coller un tracé…',
    () => {
      const layer = getActiveLayer(store.get());
      if (!layer) {
        status.show('Sélectionner un calque avant de coller un tracé.', 'error');
        return;
      }
      const text = prompt('Chemin SVG à coller (attribut d, points, ou la balise entière)');
      if (text == null) return;
      try {
        const traces = parseTrace(text);
        store.apply(addTraces, layer.id, traces);
        status.show(`${traces.length} tracé${traces.length > 1 ? 's' : ''} ajouté${traces.length > 1 ? 's' : ''}.`);
      } catch (error) {
        status.show(`Tracé refusé — ${error.message}`, 'error');
      }
    },
    'Chemin SVG (d), points de polygon/polyline — courbes échantillonnées',
  );

/**
 * Menu « Exporter » : image, projet, et collage d'un tracé.
 *
 * ponytail: `popover` natif — Échap et clic extérieur ferment le menu, pas de
 * navigation aux flèches entre les entrées (Tab suffit).
 */
export const mountExportMenu = ({ store, svgRoot, container, status }) => {
  const project = projectItems(store, status);
  const menu = document.createElement('div');
  menu.id = 'export-menu';
  menu.className = 'menu';
  menu.popover = 'auto';
  menu.append(...imageItems(svgRoot, status), ...project.items, pasteTraceItem(store, status));

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'pill-btn is-primary';
  trigger.setAttribute('popovertarget', menu.id);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.append('Exporter', icon('chevronDown', ICON_SIZE.xs));

  container.append(trigger, menu, project.fileInput);
};
