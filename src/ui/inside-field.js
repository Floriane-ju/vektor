import { activePlane, getActiveElement, insideHosts, setInside, SHAPES } from '../scene.js';
import { shapeName } from './list.js';
import { el, option, sectionHead } from './fields.js';

/**
 * « À l'intérieur de » : loge la forme dans une forme fermée du même calque,
 * dont le volume 3D la cache (voir `occlude`). Visible sur un calque en 3D, et
 * sur tout calque qui porte déjà un tel lien — éteindre la 3D ne doit pas le
 * rendre introuvable.
 */
export const insideField = ({ store }) => {
  const root = el('section', 'group');
  const head = sectionHead("À l'intérieur de");

  const select = el('select');
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
