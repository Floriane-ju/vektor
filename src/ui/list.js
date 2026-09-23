/**
 * Briques communes aux deux listes reconstruites de l'interface — le panneau
 * calques et la liste des formes.
 *
 * Les deux se redessinent entièrement à chaque notification du store, ce qui
 * détruit le bouton qui avait le focus. Sans restauration, un utilisateur au
 * clavier se retrouve rejeté en haut de la page à chaque clic.
 */

export const iconButton = ({
  label,
  text,
  onClick,
  focusKey,
  danger = false,
  pressed = null,
  disabled = false,
}) => {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = danger ? 'icon-btn is-danger' : 'icon-btn';
  node.textContent = text;
  node.dataset.focusKey = focusKey;
  node.setAttribute('aria-label', label);
  node.title = label;
  node.disabled = disabled;
  if (pressed !== null) node.setAttribute('aria-pressed', String(pressed));
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return node;
};

/**
 * Rend le focus au contrôle qui l'avait, ou au plus proche encore utilisable.
 *
 * Trois cas le font disparaître : l'élément a été supprimé, il est devenu
 * `disabled` (monter ce qui est déjà au sommet), ou il n'était pas dans cette
 * liste. Un élément désactivé n'accepte pas le focus, d'où le repli en
 * cascade : même contrôle, puis le nom de la même ligne, puis `fallback`.
 *
 * Les clés suivent la forme `<rôle>-<identifiant>`.
 */
export const restoreFocus = (container, focusKey, fallback) => {
  const id = focusKey.slice(focusKey.indexOf('-') + 1);
  const candidates = [
    container.querySelector(`[data-focus-key="${focusKey}"]`),
    container.querySelector(`[data-focus-key="name-${id}"]`),
    fallback,
  ];
  candidates.find((node) => node && !node.disabled)?.focus();
};

/**
 * Vide le conteneur, le reconstruit, et replace le focus.
 *
 * `build` renvoie le contrôle sur lequel se rabattre quand celui qui avait le
 * focus n'existe plus — en pratique le bouton « ajouter » de la liste.
 */
export const rebuildWithFocus = (container, build) => {
  const focusKey = document.activeElement?.dataset?.focusKey ?? null;
  container.replaceChildren();
  const fallback = build();
  if (focusKey) restoreFocus(container, focusKey, fallback);
};

/**
 * Ne relance `render` que si la structure de la liste a changé.
 *
 * La card sélectionnée loge les réglages : reconstruire la liste à chaque
 * notification les détacherait, et le curseur en cours de glissement perdrait
 * le focus. `signature` résume ce que la liste affiche, pas les valeurs réglées.
 */
export const whenChanged = (signature, render) => {
  let last = null;
  return (scene) => {
    const next = signature(scene);
    if (next === last) return;
    last = next;
    render(scene);
  };
};

/** Nom affiché d'une forme : son type et son rang dans le calque, compté depuis le fond. */
export const shapeName = (layer, element, labels) =>
  `${labels[element.type].label} ${layer.elements.indexOf(element) + 1}`;
