import { activePlane, getActiveElement, insideHosts, setInside, SHAPES } from '../scene.js';
import { shapeName } from './list.js';

/**
 * « À l'intérieur de » : loge la forme dans une forme fermée du même calque,
 * dont le volume 3D la cache (voir `occlude`). Visible sur un calque en 3D, et
 * sur tout calque qui porte déjà un tel lien — éteindre la 3D ne doit pas le
 * rendre introuvable.
 */
export const insideField = ({ store }) => {
  const root = document.createElement('section');
  root.className = 'group';
  const head = document.createElement('div');
  head.className = 'section-head';
  const title = document.createElement('h3');
  title.textContent = "À l'intérieur de";
  head.append(title);

  const select = document.createElement('select');
  select.id = 'inside-host';
  select.setAttribute('aria-label', "Forme dans laquelle celle-ci est logée");
  select.dataset.focusKey = 'inside-host';
  select.addEventListener('change', () => {
    const element = getActiveElement(store.get());
    if (element) store.apply(setInside, element.id, select.value || null);
  });
  root.append(head, select);

  let last = null;

  const sync = (layer, element) => {
    if (!layer || !element) return;
    root.hidden = !activePlane(layer) && !layer.elements.some((candidate) => candidate.inside);
    const hosts = insideHosts(layer, element.id);
    const next = JSON.stringify([element.id, element.inside, hosts.map((host) => [host.id, host.type])]);
    if (next === last) return;
    last = next;
    const option = (value, label) => {
      const node = document.createElement('option');
      node.value = value;
      node.textContent = label;
      return node;
    };
    select.replaceChildren(
      option('', 'Aucune'),
      ...hosts.map((host) => option(host.id, shapeName(layer, host, SHAPES))),
    );
    /* Un hôte devenu ouvert reste affiché tant que le lien existe. */
    const current = layer.elements.find((candidate) => candidate.id === element.inside);
    if (current && !hosts.includes(current)) {
      select.append(option(current.id, `${shapeName(layer, current, SHAPES)} (ouverte)`));
    }
    select.value = element.inside ?? '';
  };

  return { root, sync };
};
