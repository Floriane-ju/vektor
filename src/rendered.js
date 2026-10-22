/* Copies rendues d'un calque (`getRenderedChildren`) : piles de modificateurs
   et d'interpolations appliquées, points reliés en tracés. Ré-exporté par
   `scene.js`. */
import { applyStack, copyCount, effectiveCount, MAX_COPIES, stackCopies } from './modifiers.js';
import { ramp, stackValues } from './interpolate.js';
import { RANGE_BOUNDS } from './model.js';

/**
 * Formes effectivement dessinées d'un calque : une copie du calque entier par
 * combinaison d'indices de la pile de modificateurs, portant le déplacement
 * cumulé de la pile et les propriétés interpolées de son rang.
 *
 * Les modificateurs s'appliquent au groupe, pas forme par forme : toutes les
 * formes d'une même copie subissent le même déplacement et partagent la même
 * opacité et la même échelle. C'est ce qui fait tourner un motif comme un motif.
 *
 * Empiler multiplie : deux modificateurs de 5 et 2 copies en font 10. Une rampe
 * d'interpolation court par défaut sur ce total, pas sur chaque modificateur —
 * sinon deux copies voisines de la pile intérieure auraient la même opacité.
 * Elle se lie au besoin à un seul étage, et plusieurs interpolations peuvent
 * viser le calque : leurs valeurs se composent par produit.
 *
 * Le résultat est groupé par copie, ce qui fixe aussi l'ordre de dessin à
 * l'intérieur du calque.
 *
 * Pas de mémoïsation ici : le renderer retient le dessin de chaque calque tant
 * que sa référence ne change pas (`drawLayer`), ce qui suffit.
 */

/**
 * Facteur de rampe d'une interpolation pour la copie `i` de la pile de `owner`
 * (calque ou forme).
 *
 * Liée à un modificateur, l'interpolation ne lit que l'indice de cet étage :
 * deux copies qui n'en diffèrent pas partagent la même valeur. Une liaison qui
 * ne désigne plus de modificateur — fichier importé, étage supprimé ailleurs —
 * retombe sur la rampe globale plutôt que de rendre `NaN`.
 */
const rangeFactor = (owner, { binding, curve, seed }, indices, i, total) => {
  const modifier = binding === null ? null : owner.modifiers[binding];
  return modifier ? ramp(curve, indices[binding], effectiveCount(modifier), seed) : ramp(curve, i, total, seed);
};

/**
 * Copies dessinées du calque : celles de sa pile, fois celles de chaque forme.
 * Un calque vide compte comme une forme sans pile : sa pile trop lourde se
 * signale avant la première forme posée.
 */
export const copyTotal = (layer) =>
  copyCount(layer.modifiers) * (layer.elements.reduce((sum, element) => sum + copyCount(element.modifiers), 0) || 1);

/** Pile qui dépasse `MAX_COPIES` : le calque n'est pas rendu, le panneau le dit. */
export const isSuspended = (layer) => copyTotal(layer) > MAX_COPIES;

/* Étirement interpolé, dans le repère de la forme : demi-extensions et
   sommets d'un tracé. Rien à étirer sur un point (extensions nulles).
   ponytail: polygone et arc ne lisent que `rx` — seul l'étirement X les
   touche (uniformément). Les échantillonner en tracé le jour où il faut les aplatir. */
const stretch = (element, sx, sy) => {
  if (sx === 1 && sy === 1) return {};
  return {
    rx: element.rx * sx,
    ry: element.ry * sy,
    ...(element.points ? { points: element.points.map((p) => ({ x: p.x * sx, y: p.y * sy })) } : {}),
  };
};

/**
 * Chaque copie `i` du calque répète chaque forme, et chaque forme ses copies
 * propres `j` : la pile de la forme s'applique d'abord, celle du calque ensuite
 * (orientation comprise). Les interpolations de la forme courent sur ses
 * copies propres et se composent avec celles du calque — la couleur de la
 * forme, dernière de la pile, l'emporte.
 *
 * `copy` = rang de la copie du calque, `own` = rang de la copie propre : le
 * booléen et la forme logée s'apparient sur les deux.
 */
export const getRenderedChildren = (layer) => {
  if (layer.elements.length === 0 || isSuspended(layer)) return [];
  const copies = stackCopies(layer.modifiers);
  /* Toutes les copies d'abord : un étage du calque relie un point à ses
     copies des rangs suivants. */
  const drawn = copies.map((indices, i) => layer.elements.map((element) => ownCopiesOf(layer, element, indices, i, copies.length)));
  const layerStages = linearStages(layer.modifiers);
  return copies.flatMap((indices, i) =>
    layer.elements.flatMap((element, e) => {
      const own = drawn[i][e];
      if (element.type !== 'point') return own;
      const ownCopies = stackCopies(element.modifiers);
      const place = (ownIndices, layerIndices = indices) =>
        applyStack(applyStack(element, element.modifiers, ownIndices, layer.center), layer.modifiers, layerIndices, layer.center);
      /* Le long d'un étage du calque : une chaîne par copie propre, émise au
         premier rang de l'étage. */
      const across = layerStages
        .filter(({ k }) => indices[k] === 0)
        .flatMap(({ k, n, stride, wrap, smooth }) =>
          own.map((point, j) => {
            const links =
              smooth && n > 2
                ? sweep(indices, k, n, wrap, (layerIndices) => place(ownCopies[j], layerIndices))
                : Array.from({ length: n }, (_, step) => drawn[i + step * stride][e][j]);
            return chain(point, links, wrap, smooth);
          }),
        );
      /* Relié par le calque seul, le point ne se dessine plus en points. */
      const within =
        layerStages.length > 0 && linearStages(element.modifiers).length === 0
          ? []
          : linkPoints(element.modifiers, ownCopies, own, place);
      return [...within, ...across];
    }),
  );
};

/* Copies propres d'une forme dans la copie `i` du calque, interpolées. */
const ownCopiesOf = (layer, element, indices, i, total) => {
  const ownCopies = stackCopies(element.modifiers);
  return ownCopies.map((ownIndices, j) => {
    const factors = new Map([
      ...layer.interpolations.map((it) => [it, rangeFactor(layer, it, indices, i, total)]),
      ...element.interpolations.map((it) => [it, rangeFactor(element, it, ownIndices, j, ownCopies.length)]),
    ]);
    const {
      rotation: twist = 0,
      strokeWidth: widthFactor = 1,
      scaleX = 1,
      scaleY = 1,
      color,
      ...properties
    } = stackValues(
      [...factors.keys()],
      (interpolation) => factors.get(interpolation),
      RANGE_BOUNDS,
    );
    const local = applyStack(element, element.modifiers, ownIndices, layer.center);
    const { x, y, angle, flip } = applyStack(local, layer.modifiers, indices, layer.center);
    /* Orientation de la copie puis rotation propre : `R(a)·S·R(r) = R(a − r)·S`,
       le reflet inverse le sens de l'angle propre — vrille interpolée comprise,
       pour qu'un motif miroir vrille en miroir. */
    const spin = (element.rotation ?? 0) + twist;
    return {
      ...element,
      ...stretch(element, scaleX, scaleY),
      strokeWidth: element.strokeWidth * widthFactor,
      stroke: color ?? element.stroke,
      fill: element.filled ? (color ?? element.stroke) : 'none',
      x,
      y,
      rotation: (angle * 180) / Math.PI + (flip ? -spin : spin),
      flip,
      copy: i,
      own: j,
      ...properties,
    };
  });
};

/**
 * Étages dont la case « Activer les répétitions linéaires » est cochée, avec
 * leur pas dans la numérotation de `stackCopies` (le dernier étage varie le
 * plus vite). Un étage d'une seule copie n'a rien à relier. L'axial se referme :
 * sa dernière copie rejoint la première.
 */
const linearStages = (modifiers) =>
  modifiers.flatMap((modifier, k) => {
    const n = effectiveCount(modifier);
    if (!modifier.linear || n < 2) return [];
    const stride = modifiers.slice(k + 1).reduce((total, next) => total * effectiveCount(next), 1);
    return [{ k, n, stride, wrap: modifier.type === 'axial' && n > 2, smooth: modifier.smooth === true }];
  });

/* Chaîne des copies d'un point le long d'un étage : un seul tracé, pour que
   tirets et contour double courent d'un bout à l'autre sans casser aux
   jointures. Elle porte le style de trait du point et les valeurs
   interpolées de sa première copie. L'échelle de la copie passe dans
   l'épaisseur et l'écart, comme pour le point : les sommets tombent pile sur
   les copies. */
const chain = (from, links, closed, smooth) => ({
  ...from,
  type: 'polyline',
  points: links.map((link) => ({ x: link.x - from.x, y: link.y - from.y })),
  closed,
  smooth,
  fill: 'none',
  rotation: 0,
  flip: false,
  strokeWidth: from.strokeWidth * (from.scale ?? 1),
  gap: from.gap * (from.scale ?? 1),
  scale: 1,
});

/**
 * Répétition linéaire : portée par l'étage, pas par le point. Un point ne se
 * dessine plus copie par copie ; le long de chaque étage coché de **sa propre** pile, ses copies
 * successives forment un tracé, émis à la première copie de la rangée. Les
 * étages cochés du calque relient de même, copie propre par copie propre
 * (`getRenderedChildren`). Aucun étage coché : les points restent des points.
 *
 * ponytail: une chaîne n'a qu'une couleur, une opacité, une épaisseur — celles
 * de sa première copie. Un dégradé le long du tracé demanderait de le
 * découper, ce que le contour double interdit.
 */
/* Sommets intermédiaires par intervalle d'une chaîne lissée. */
const SMOOTH_STEPS = 12;

/* Lissé, le tracé suit la transformation même de l'étage à indice
   fractionnaire — arc de spirale, de cercle ou segment exacts, passant par
   chaque copie (indices entiers). Une approximation (Catmull-Rom) ondulait
   entre les copies dès que le pas angulaire s'élargit. À deux copies (miroir),
   un segment. */
const sweep = (indices, k, n, closed, place) =>
  Array.from({ length: (closed ? n : n - 1) * SMOOTH_STEPS + (closed ? 0 : 1) }, (_, s) =>
    place(indices.with(k, s / SMOOTH_STEPS)),
  );

const linkPoints = (modifiers, copies, points, place) => {
  const stages = linearStages(modifiers);
  if (stages.length === 0) return points;
  return points.flatMap((point, j) =>
    stages
      .filter(({ k }) => copies[j][k] === 0)
      .map(({ k, n, stride, wrap, smooth }) => {
        const links =
          smooth && n > 2
            ? sweep(copies[j], k, n, wrap, place)
            : Array.from({ length: n }, (_, step) => points[j + step * stride]);
        return chain(point, links, wrap, smooth);
      }),
  );
};
