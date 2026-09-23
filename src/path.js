/**
 * Lecture d'un tracé collé : un attribut `d` de `<path>`, un attribut `points`
 * de `<polygon>`/`<polyline>`, ou la balise entière qui les porte.
 *
 * Rend une liste de sous-tracés `{ points: [{x, y}], closed }` en coordonnées
 * absolues. Un `d` à plusieurs `M` donne plusieurs sous-tracés — un labyrinthe
 * collé d'un bloc en compte des dizaines.
 *
 * ponytail: segments droits seulement (M, L, H, V, Z). Le modèle ne porte que
 * des sommets ; une courbe demanderait de l'échantillonner ou un nouveau type
 * de forme. À ajouter quand la planche en réclame une.
 */

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const TOKEN = /[a-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

const fail = (message) => {
  throw new Error(message);
};

const attribute = (text, name) =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(text)?.slice(2).find((v) => v !== undefined);

const parsePoints = (text, closed) => {
  const numbers = (text.match(NUMBER) ?? []).map(Number);
  if (numbers.length < 4 || numbers.length % 2 !== 0) fail('Liste de points incomplète.');
  const points = [];
  for (let i = 0; i < numbers.length; i += 2) points.push({ x: numbers[i], y: numbers[i + 1] });
  return [{ points, closed }];
};

const parseD = (d) => {
  const tokens = d.match(TOKEN) ?? [];
  const paths = [];
  let current = null;
  let command = null;
  let pen = { x: 0, y: 0 };
  let start = pen;
  let i = 0;

  const read = () => {
    const value = Number(tokens[i]);
    if (i >= tokens.length || !Number.isFinite(value)) fail('Coordonnée manquante dans le chemin.');
    i += 1;
    return value;
  };
  const lineTo = (point) => {
    if (!current) {
      current = { points: [start], closed: false };
      paths.push(current);
    }
    pen = point;
    current.points.push(point);
  };

  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) {
      command = tokens[i];
      i += 1;
      if (!/[mlhvz]/i.test(command)) {
        fail(`Commande « ${command} » non prise en charge : seulement M, L, H, V, Z.`);
      }
    } else if (!command) {
      fail('Coordonnée sans commande dans le chemin.');
    }
    if (paths.length === 0 && command.toLowerCase() !== 'm') fail('Le chemin doit commencer par M.');
    const relative = command === command.toLowerCase();
    const base = relative ? pen : { x: 0, y: 0 };

    switch (command.toLowerCase()) {
      case 'm': {
        const point = { x: base.x + read(), y: base.y + read() };
        current = { points: [point], closed: false };
        paths.push(current);
        pen = point;
        start = point;
        /* Des paires qui suivent un M sont des L implicites. */
        command = relative ? 'l' : 'L';
        break;
      }
      case 'l':
        lineTo({ x: base.x + read(), y: base.y + read() });
        break;
      case 'h':
        lineTo({ x: (relative ? pen.x : 0) + read(), y: pen.y });
        break;
      case 'v':
        lineTo({ x: pen.x, y: (relative ? pen.y : 0) + read() });
        break;
      case 'z':
        if (current) current.closed = true;
        /* Après Z, le stylo revient au départ ; un tracé qui continue sans M
           ouvre un nouveau sous-tracé depuis ce point. */
        pen = start;
        current = null;
        command = null;
        break;
    }
  }

  const drawn = paths.filter((path) => path.points.length >= 2);
  if (drawn.length === 0) fail('Le chemin ne trace aucun segment.');
  return drawn;
};

export const parseTrace = (text) => {
  const source = String(text ?? '').trim();
  if (source === '') fail('Rien à importer.');
  const d = attribute(source, 'd');
  if (d !== undefined) return parseD(d);
  const points = attribute(source, 'points');
  if (points !== undefined) return parsePoints(points, /<\s*polygon\b/i.test(source));
  return /^[a-z]/i.test(source) ? parseD(source) : parsePoints(source, false);
};
