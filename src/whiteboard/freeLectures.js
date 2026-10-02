// Free lectures: three hand-made lectures (computer science, biology, business) of five
// boards each, in English and French, with a closing quiz. Pure data, shared by the client
// (which plays them: no generation needed) and the server (which caches their voice, so
// replaying them costs nothing) and checked by the tests (schema + layout lint).

import { r1, T, M, line, arrow, circle, rect, path, heading, axes, curve, boxes } from './draw.js'; // drawing helpers (see draw.js for more)

const lesson = (title, steps) => ({
  title,
  spec: { title, steps: steps.map((s, i) => ({ cue: `s${i + 1}`, elements: s.draw })) },
  narration: steps.map((s, i) => ({ id: `s${i + 1}`, text: s.say })),
});

// --- Computer science: algorithms ---------------------------------------------------------

function computerScience(L) {
  // Slide 1: linear vs binary search on 16 sorted numbers (the target 72 is at index 10).
  const values = [2, 5, 8, 12, 16, 23, 38, 45, 56, 67, 72, 78, 84, 91, 95, 99];
  const bx = (i) => 60 + 44 * i, bc = (i) => bx(i) + 22;
  const range = (lo, hi, mid, y, label, color = 'orange') => [
    line(bx(lo), y, bx(hi + 1), y, color, 4), circle(bc(mid), y, 9, color, color), T(780, y, label, 22, { color }),
  ];
  const search = lesson(L('Linear vs binary search', 'Recherche linéaire ou dichotomique'), [
    {
      draw: [heading(L('Linear vs binary search', 'Recherche linéaire ou dichotomique')), T(960, 90, L('Target: 72', 'Cible : 72'), 28, { align: 'right', color: 'red' }),
        ...boxes(values, 60, 120, 44, 48)],
      say: L('Here are sixteen numbers, sorted from smallest to largest. Our job: find seventy-two. How many looks will it take?',
        'Voici seize nombres, triés du plus petit au plus grand. Notre mission : trouver soixante-douze. Combien de coups d’œil faudra-t-il ?'),
    },
    {
      draw: [arrow(bc(0), 200, bc(10), 200, 'blue', 4), T(60, 240, L('Linear search: 11 checks', 'Recherche linéaire : 11 essais'), 24, { color: 'blue' })],
      say: L('The naive way is linear search: check the numbers one by one, from the left. Here that takes eleven checks, and in the worst case, all sixteen.',
        'La méthode naïve, c’est la recherche linéaire : on regarde les nombres un par un, depuis la gauche. Ici, il faut onze essais, et dans le pire des cas, les seize.'),
    },
    {
      draw: [
        ...range(0, 15, 7, 290, L('45 < 72: go right', '45 < 72 : à droite')),
        ...range(8, 15, 11, 345, L('78 > 72: go left', '78 > 72 : à gauche')),
        ...range(8, 10, 9, 400, L('67 < 72: go right', '67 < 72 : à droite')),
        circle(bc(10), 455, 12, 'green', 'green'), T(780, 455, L('Found in 4 checks!', 'Trouvé en 4 essais !'), 22, { color: 'green' }),
      ],
      say: L('Binary search is smarter, because the list is sorted. Look at the middle: forty-five is too small, so throw away the whole left half. The middle of what is left: seventy-eight, too big. Then sixty-seven, too small. And there it is: four checks instead of eleven.',
        'La recherche dichotomique est plus maligne, car la liste est triée. On regarde le milieu : quarante-cinq, trop petit, on jette toute la moitié gauche. Le milieu de ce qui reste : soixante-dix-huit, trop grand. Puis soixante-sept, trop petit. Et le voilà : quatre essais au lieu de onze.'),
    },
    {
      draw: [T(60, 492, L('1 million items: linear up to 1,000,000 checks, binary about', '1 million d’éléments : linéaire jusqu’à 1 000 000 d’essais, dichotomie environ'), 22),
        M(500, 535, '\\log_2 10^6 \\approx 20', 26, { align: 'center', color: 'green' })],
      say: L('Each look halves the problem. So with a million sorted items, linear search may need a million checks, and binary search only about twenty. That is the power of a good algorithm.',
        'Chaque coup d’œil coupe le problème en deux. Avec un million d’éléments triés, la recherche linéaire peut demander un million d’essais, la dichotomie une vingtaine seulement. Voilà la puissance d’un bon algorithme.'),
    },
  ]);

  // Slide 2: growth of running time.
  const gx = (t) => 100 + 720 * t;
  const bigO = lesson(L('How running time grows', 'Comment le temps de calcul grandit'), [
    {
      draw: [heading(L('How running time grows', 'Comment le temps de calcul grandit')), ...axes(100, 500, 780, 420),
        T(870, 530, L('input size n', 'taille des données n'), 22, { align: 'right' }), T(115, 70, L('steps', 'étapes'), 22),
        curve((t) => [gx(t), 470], 0, 1, 'green', 2), M(830, 470, 'O(1)', 24, { color: 'green' }),
        curve((t) => [gx(t), 500 - 200 * t], 0, 1, 'blue', 2), M(830, 300, 'O(n)', 24, { color: 'blue' })],
      say: L('Computer scientists compare algorithms by how their running time grows with the size of the input, n. Constant time stays flat, whatever n. Linear time, like linear search, grows in a straight line.',
        'Les informaticiens comparent les algorithmes selon la croissance de leur temps de calcul quand la taille des données, n, augmente. Le temps constant reste plat, quel que soit n. Le temps linéaire, comme la recherche linéaire, grandit en ligne droite.'),
    },
    {
      draw: [curve((t) => [gx(t), 500 - 110 * Math.log2(1 + 15 * t) / 4], 0, 1, 'orange'), M(830, 390, 'O(\\log n)', 24, { color: 'orange' })],
      say: L('Binary search is logarithmic: doubling the data adds just one more step. The curve almost flattens out.',
        'La recherche dichotomique est logarithmique : doubler les données n’ajoute qu’une étape. La courbe s’aplatit presque.'),
    },
    {
      draw: [curve((t) => [gx(t), 500 - 400 * t * t], 0, 1, 'red'), M(830, 100, 'O(n^2)', 24, { color: 'red' })],
      say: L('Now the danger zone: quadratic time, like comparing every item with every other one. Double the data, and the work is multiplied by four.',
        'Maintenant, la zone de danger : le temps quadratique, comme comparer chaque élément à tous les autres. Doublez les données, et le travail est multiplié par quatre.'),
    },
    {
      draw: [curve((t) => [gx(t), 500 - 320 * t * Math.log2(1 + 15 * t) / 4], 0, 1, 'purple'), M(830, 180, 'O(n \\log n)', 24, { color: 'purple' }),
        M(130, 140, 'n = 10^6:\\quad n^2 = 10^{12},\\quad n \\log_2 n \\approx 2 \\times 10^7', 24)],
      say: L('The best sorting algorithms sit in between, at n log n. For a million items, that is about twenty million steps instead of a trillion: seconds instead of days.',
        'Les meilleurs algorithmes de tri se situent entre les deux, en n log n. Pour un million d’éléments, cela fait environ vingt millions d’étapes au lieu de mille milliards : des secondes au lieu de jours.'),
    },
  ]);

  // Slide 3: merge sort, top-down split then bottom-up merge.
  const W = 42, H = 40;
  const row = (vals, x, y, color, fill) => boxes(vals, x, y, W, H, color, fill);
  const mid = (x, n) => x + (n * W) / 2;
  const L0 = [38, 27, 43, 3, 9, 82, 10, 5];
  const xs1 = [150, 682], xs2 = [80, 290, 626, 836];
  const pairs = [[38, 27], [43, 3], [9, 82], [10, 5]], sortedPairs = [[27, 38], [3, 43], [9, 82], [5, 10]];
  const merge = lesson(L('Merge sort: divide and conquer', 'Le tri fusion : diviser pour régner'), [
    {
      draw: [heading(L('Merge sort: divide and conquer', 'Le tri fusion : diviser pour régner')), ...row(L0, 332, 70, 'black')],
      say: L('How do you sort fast? Merge sort uses a classic trick: divide and conquer. Here are eight numbers in random order.',
        'Comment trier vite ? Le tri fusion utilise une astuce classique : diviser pour régner. Voici huit nombres dans le désordre.'),
    },
    {
      draw: [
        arrow(mid(332, 4), 110, mid(xs1[0], 4), 140, 'blue', 2.5), arrow(mid(332, 4) + 168, 110, mid(xs1[1], 4), 140, 'blue', 2.5),
        ...row(L0.slice(0, 4), xs1[0], 140, 'blue'), ...row(L0.slice(4), xs1[1], 140, 'blue'),
        ...xs2.map((x, i) => arrow(mid(xs1[i >> 1], 4) + (i % 2 ? 42 : -42), 180, mid(x, 2), 210, 'blue', 2.5)),
        ...pairs.flatMap((p, i) => row(p, xs2[i], 210, 'blue')),
        T(30, 180, L('divide', 'diviser'), 22, { color: 'blue' }),
      ],
      say: L('First, divide: cut the list in half, then cut each half again, until the pieces are tiny. A piece of one or two numbers is trivial to sort.',
        'D’abord, diviser : on coupe la liste en deux, puis chaque moitié en deux, jusqu’à obtenir de tout petits morceaux. Un morceau d’un ou deux nombres se trie sans effort.'),
    },
    {
      draw: [...xs2.flatMap((x, i) => [arrow(mid(x, 2), 250, mid(x, 2), 290, 'green', 2.5), ...row(sortedPairs[i], x, 290, 'green')])],
      say: L('Sort each little pair: twenty-seven before thirty-eight, three before forty-three, and so on.',
        'On trie chaque petite paire : vingt-sept avant trente-huit, trois avant quarante-trois, et ainsi de suite.'),
    },
    {
      draw: [
        ...xs2.map((x, i) => arrow(mid(x, 2), 330, mid(xs1[i >> 1], 4) + (i % 2 ? 42 : -42), 370, 'green', 2.5)),
        ...row([3, 27, 38, 43], xs1[0], 370, 'green'), ...row([5, 9, 10, 82], xs1[1], 370, 'green'),
        arrow(mid(xs1[0], 4), 410, mid(332, 4) - 84, 450, 'green', 2.5), arrow(mid(xs1[1], 4), 410, mid(332, 4) + 84, 450, 'green', 2.5),
        ...row([3, 5, 9, 10, 27, 38, 43, 82], 332, 450, 'green', '#dcf2e2'),
        T(30, 410, L('merge', 'fusionner'), 22, { color: 'green' }),
        M(500, 525, '\\log_2 8 = 3 \\text{ ' + L('levels', 'niveaux') + '} \\times n \\;\\Rightarrow\\; n \\log n', 22, { align: 'center' }),
      ],
      say: L('Then conquer: merge sorted lists by repeatedly taking the smaller front item. Each level costs n steps, and there are only log n levels. That is where n log n comes from.',
        'Puis régner : on fusionne les listes triées en prenant à chaque fois le plus petit élément en tête. Chaque niveau coûte n étapes, et il n’y a que log n niveaux. Voilà d’où vient le n log n.'),
    },
  ]);

  // Slide 4: Dijkstra's shortest path (A -> F = 13 through C, B, D, E).
  const N = { A: [120, 300], B: [330, 150], C: [330, 440], D: [580, 150], E: [580, 440], F: [840, 300] };
  const edges = [['A', 'B', 4, 210, 212], ['A', 'C', 2, 210, 388], ['B', 'C', 1, 348, 295], ['B', 'D', 5, 455, 130],
    ['C', 'E', 9, 455, 462], ['D', 'E', 2, 598, 295], ['D', 'F', 6, 730, 210], ['E', 'F', 3, 730, 390]];
  const dist = { A: [0, 120, 250], C: [2, 330, 494], B: [3, 330, 98], D: [8, 580, 98], E: [10, 580, 494], F: [13, 840, 250] };
  const distLabel = (k) => T(dist[k][1], dist[k][2], String(dist[k][0]), 26, { align: 'center', color: 'red' });
  const edge = (a, b, color, width) => line(N[a][0], N[a][1], N[b][0], N[b][1], color, width);
  /** The same edge, stopping at the node circles (so a highlighted route doesn't cover the letters). */
  const route = (a, b) => {
    const [x1, y1] = N[a], [x2, y2] = N[b], d = Math.hypot(x2 - x1, y2 - y1), k = 28 / d;
    return line(r1(x1 + (x2 - x1) * k), r1(y1 + (y2 - y1) * k), r1(x2 - (x2 - x1) * k), r1(y2 - (y2 - y1) * k), 'red', 7);
  };
  const dijkstra = lesson(L('Shortest paths: how a GPS finds a route', 'Plus court chemin : comment un GPS trouve la route'), [
    {
      draw: [heading(L('Shortest paths: how a GPS finds a route', 'Plus court chemin : le GPS')),
        ...edges.flatMap(([a, b, w, tx, ty]) => [edge(a, b, 'black', 2.5), T(tx, ty, String(w), 22, { align: 'center', color: 'blue' })]),
        ...Object.entries(N).flatMap(([k, [x, y]]) => [circle(x, y, 26, 'black', '#ffffff'), T(x, y, k, 26, { align: 'center' })])],
      say: L('A road map is a graph: places are nodes, roads are edges, and each road has a travel time. What is the fastest way from A to F?',
        'Une carte routière est un graphe : les lieux sont des nœuds, les routes des arêtes, et chaque route a un temps de trajet. Quel est le chemin le plus rapide de A à F ?'),
    },
    {
      draw: [distLabel('A'), distLabel('C'), distLabel('B')],
      say: L('Dijkstra’s algorithm grows a bubble of known distances. A is at zero. Its closest neighbour is C, at two. And B? Directly it costs four, but through C only two plus one: three.',
        'L’algorithme de Dijkstra fait grandir une bulle de distances connues. A est à zéro. Son voisin le plus proche est C, à deux. Et B ? En direct, quatre, mais en passant par C, deux plus un : trois.'),
    },
    {
      draw: [distLabel('D'), distLabel('E'), distLabel('F')],
      say: L('Always extend the closest unfinished node. D gets eight through B. E gets ten through D, better than eleven through C. And F: thirteen.',
        'On prolonge toujours le nœud non terminé le plus proche. D obtient huit via B. E obtient dix via D, mieux que onze via C. Et F : treize.'),
    },
    {
      draw: [route('A', 'C'), route('C', 'B'), route('B', 'D'), route('D', 'E'), route('E', 'F'),
        T(500, 530, L('Shortest route: A, C, B, D, E, F = 13', 'Plus court chemin : A, C, B, D, E, F = 13'), 24, { align: 'center', color: 'red' })],
      say: L('The winning route zigzags: A, C, back up to B, then D, E, F. Not obvious at all, yet guaranteed optimal. Your GPS does this on millions of roads in a blink.',
        'L’itinéraire gagnant zigzague : A, C, on remonte vers B, puis D, E, F. Pas évident du tout, et pourtant garanti optimal. Votre GPS fait cela sur des millions de routes en un clin d’œil.'),
    },
  ]);

  // Slide 5: hash table with a collision.
  const keys = [[L('Alice', 'Alice'), 140, 3], [L('Bob', 'Bob'), 220, 6], [L('Chloe', 'Chloé'), 300, 1], [L('David', 'David'), 380, 3]];
  const by = (i) => 90 + 52 * i;
  const hash = lesson(L('Hash tables: find anything in one step', 'Tables de hachage : tout retrouver en un pas'), [
    {
      draw: [heading(L('Hash tables: find anything in one step', 'Tables de hachage : un seul pas')),
        ...keys.map(([k, y]) => T(80, y, k, 26)),
        rect(300, 200, 220, 120, 'purple', '#efe6fb'), M(410, 260, 'h(k) \\bmod 8', 28, { align: 'center', color: 'purple' }),
        // Bucket numbers inside, on the left: the arrows arrive from the left edge.
        ...Array.from({ length: 8 }, (_, i) => [rect(720, by(i), 150, 46, 'black', null, 2.5), T(732, by(i) + 23, String(i), 20, { color: '#888888' })]).flat()],
      say: L('How does a phone book app find a name instantly? With a hash table: a hash function turns each key into a bucket number, here from zero to seven.',
        'Comment une application de contacts retrouve-t-elle un nom instantanément ? Avec une table de hachage : une fonction de hachage transforme chaque clé en numéro de case, ici de zéro à sept.'),
    },
    {
      draw: keys.slice(0, 3).flatMap(([k, y, b]) => [arrow(170, y, 298, 260, 'blue', 2), arrow(522, 260, 718, by(b) + 23, 'blue', 2), T(805, by(b) + 23, k, 22, { align: 'center', color: 'blue' })]),
      say: L('Alice goes to bucket three, Bob to six, Chloe to one. To find Bob later, no searching: compute the hash again and jump straight to bucket six.',
        'Alice va dans la case trois, Bob dans la six, Chloé dans la un. Pour retrouver Bob plus tard, aucune recherche : on recalcule le hachage et on saute directement à la case six.'),
    },
    {
      draw: [arrow(170, 380, 298, 260, 'red', 2), arrow(522, 260, 718, by(3) + 23, 'red', 2),
        arrow(870, by(3) + 23, 888, by(3) + 23, 'red', 2), rect(890, by(3), 70, 46, 'red', '#fbe1e1', 2.5), T(925, by(3) + 23, 'David', 20, { align: 'center', color: 'red' }),
        T(960, 530, L('collision: chain it', 'collision : on chaîne'), 22, { align: 'right', color: 'red' })],
      say: L('David also lands in bucket three: a collision. No problem, we chain him next to Alice. With a good hash function, chains stay very short.',
        'David tombe aussi dans la case trois : une collision. Pas de problème, on l’accroche à côté d’Alice. Avec une bonne fonction de hachage, ces chaînes restent très courtes.'),
    },
    {
      draw: [T(60, 530, L('Average lookup:', 'Recherche moyenne :'), 26, { color: 'green' }), M(L(270, 322), 530, 'O(1)', 28, { align: 'left', color: 'green' }),
        T(L(340, 395), 530, L('whatever the size', 'quelle que soit la taille'), 26, { color: 'green' })],
      say: L('So on average, a lookup takes one step, whether you store ten names or ten billion. That is why hash tables are everywhere: databases, caches, and every programming language.',
        'En moyenne, une recherche prend donc un seul pas, que l’on stocke dix noms ou dix milliards. C’est pour cela que les tables de hachage sont partout : bases de données, caches, et tous les langages de programmation.'),
    },
  ]);

  return {
    title: L('Algorithms: search, sort and find your way', 'Algorithmes : chercher, trier, trouver son chemin'),
    summary: L('Binary search, Big-O, merge sort, Dijkstra and hash tables, drawn step by step.', 'Dichotomie, grand O, tri fusion, Dijkstra et tables de hachage, dessinés pas à pas.'),
    slides: [search, bigO, merge, dijkstra, hash],
    quiz: [
      { question: L('Binary search only works if the list is…', 'La recherche dichotomique ne marche que si la liste est…'), options: [L('sorted', 'triée'), L('short', 'courte'), L('random', 'aléatoire')], answer: 0 },
      { question: L('Doubling n for an O(n^2) algorithm multiplies the time by…', 'Doubler n pour un algorithme en O(n^2) multiplie le temps par…'), options: ['2', '4', '8'], answer: 1 },
      { question: L('Merge sort takes about…', 'Le tri fusion prend environ…'), options: [L('n^2 steps', 'n^2 étapes'), L('1 step', '1 étape'), L('n log n steps', 'n log n étapes')], answer: 2 },
      { question: L('Dijkstra always extends…', 'Dijkstra prolonge toujours…'), options: [L('the closest unfinished node', 'le nœud non terminé le plus proche'), L('the last node added', 'le dernier nœud ajouté'), L('a random node', 'un nœud au hasard')], answer: 0 },
      { question: L('Two keys in the same bucket is called a…', 'Deux clés dans la même case, c’est une…'), options: [L('rotation', 'rotation'), L('collision', 'collision'), L('overflow', 'saturation')], answer: 1 },
    ],
  };
}

// --- Biology: viruses, epidemics and vaccines ----------------------------------------------

/** SIR epidemic model, daily steps: [{ s, i, r }] for `days` days. */
function sir(beta, gamma, days, i0 = 0.001) {
  let s = 1 - i0, i = i0, r = 0;
  const out = [{ s, i, r }];
  for (let d = 0; d < days; d++) {
    for (let k = 0; k < 10; k++) { // 10 sub-steps per day for accuracy
      const inf = (beta * s * i) / 10, rec = (gamma * i) / 10;
      s -= inf; i += inf - rec; r += rec;
    }
    out.push({ s, i, r });
  }
  return out;
}

function virus(cx, cy, r, color = 'red') {
  const spikes = Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    return line(r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a)), r1(cx + (r + 12) * Math.cos(a)), r1(cy + (r + 12) * Math.sin(a)), color, 2.5);
  });
  return [circle(cx, cy, r, color, '#fbe1e1'), ...spikes];
}

function biology(L) {
  // Slide 1: viral replication cycle.
  const cell = lesson(L('How a virus hijacks a cell', 'Comment un virus détourne une cellule'), [
    {
      draw: [heading(L('How a virus hijacks a cell', 'Comment un virus détourne une cellule')),
        circle(560, 320, 210, 'green', '#eef8ee'), circle(610, 330, 60, 'purple', '#efe6fb'), T(610, 330, L('nucleus', 'noyau'), 22, { align: 'center', color: 'purple' }),
        ...virus(150, 190, 30), T(150, 248, 'virus', 22, { align: 'center', color: 'red' })],
      say: L('A virus is not even alive on its own: it is a tiny package of genes in a protein shell. To multiply, it needs one of our cells.',
        'Un virus n’est même pas vivant tout seul : c’est un minuscule paquet de gènes dans une coque de protéines. Pour se multiplier, il lui faut une de nos cellules.'),
    },
    {
      draw: [line(356, 250, 340, 238, 'green', 3), line(340, 238, 330, 226, 'green', 3), line(340, 238, 348, 222, 'green', 3),
        arrow(182, 200, 322, 226, 'red', 3), ...virus(430, 260, 14),
        T(40, 330, L('1. Lock onto a receptor', '1. S’accrocher à un récepteur'), 22, { color: 'red' }),
        T(40, 370, L('2. Slip inside', '2. Entrer dans la cellule'), 22, { color: 'red' })],
      say: L('Its spikes fit a receptor on the cell surface, like a key in a lock. The cell is fooled, and lets the virus in.',
        'Ses spicules s’emboîtent dans un récepteur à la surface de la cellule, comme une clé dans une serrure. La cellule se laisse berner et fait entrer le virus.'),
    },
    {
      draw: [arrow(560, 350, 480, 420, 'purple', 2.5), arrow(640, 380, 680, 440, 'purple', 2.5), arrow(640, 290, 690, 220, 'purple', 2.5),
        ...virus(470, 435, 12), ...virus(530, 470, 12), ...virus(690, 455, 12), ...virus(700, 205, 12), ...virus(640, 180, 12),
        T(40, 410, L('3. The cell copies it', '3. La cellule le copie'), 22, { color: 'red' })],
      say: L('Inside, the viral genes take over the cell’s machinery. The cell stops its own work and becomes a factory, assembling copies of the virus.',
        'À l’intérieur, les gènes viraux prennent le contrôle de la machinerie cellulaire. La cellule abandonne son propre travail et devient une usine qui assemble des copies du virus.'),
    },
    {
      draw: [arrow(760, 250, 815, 205, 'red', 2.5), arrow(772, 320, 830, 320, 'red', 2.5), arrow(755, 400, 815, 440, 'red', 2.5),
        ...virus(840, 190, 16), ...virus(860, 320, 16), ...virus(840, 455, 16),
        T(40, 450, L('4. Thousands burst out', '4. Des milliers en sortent'), 22, { color: 'red' })],
      say: L('Finally, hundreds or thousands of new viruses burst out, each ready to infect another cell. One infected cell, a thousand new infections: that is where epidemics begin.',
        'Enfin, des centaines ou des milliers de nouveaux virus s’échappent, chacun prêt à infecter une autre cellule. Une cellule infectée, mille nouvelles infections : c’est là que commencent les épidémies.'),
    },
  ]);

  // Slide 2: exponential spread, R = 3.
  const g1 = [300, 500, 700];
  const g2 = Array.from({ length: 9 }, (_, k) => 140 + 90 * k);
  const g3 = Array.from({ length: 27 }, (_, k) => 110 + 30 * k);
  const person = (x, y, r, color = 'red') => circle(x, y, r, color, '#fbe1e1', 2.5);
  const spread = lesson(L('Exponential spread: the R number', 'Propagation exponentielle : le nombre R'), [
    {
      draw: [heading(L('Exponential spread: the R number', 'Propagation exponentielle : le nombre R')), M(960, 90, 'R = 3', 30, { align: 'right', color: 'red' }),
        person(500, 120, 14), ...g1.flatMap((x) => [line(500, 134, x, 196, 'red', 2), person(x, 210, 14)]), T(960, 210, '3', 26, { align: 'right' })],
      say: L('Epidemiologists track one number above all: R, how many people each sick person infects. Say R is three. Patient zero infects three people.',
        'Les épidémiologistes surveillent un nombre avant tout : R, le nombre de personnes qu’infecte chaque malade. Disons que R vaut trois. Le patient zéro contamine trois personnes.'),
    },
    {
      draw: [...g2.flatMap((x, k) => [line(g1[Math.floor(k / 3)], 224, x, 306, 'red', 2), person(x, 320, 14)]), T(960, 320, '9', 26, { align: 'right' })],
      say: L('Each of them infects three more: nine.', 'Chacune en contamine trois autres : neuf.'),
    },
    {
      draw: [...g3.flatMap((x, k) => [line(g2[Math.floor(k / 3)], 334, x, 421, 'red', 1.5), person(x, 430, 9)]), T(960, 430, '27', 26, { align: 'right' })],
      say: L('Then twenty-seven. The tree gets wider at every generation: this is exponential growth, and our intuition badly underestimates it.',
        'Puis vingt-sept. L’arbre s’élargit à chaque génération : c’est la croissance exponentielle, et notre intuition la sous-estime énormément.'),
    },
    {
      draw: [T(60, 495, L('After 10 generations:', 'Après 10 générations :'), 26), M(L(330, 345), 495, '3^{10} = 59\\,049', 28, { color: 'red' }),
        T(60, 540, L('Push R below 1, and every generation shrinks: the outbreak dies out.', 'Si R passe sous 1, chaque génération rétrécit : l’épidémie s’éteint.'), 22, { color: 'green' })],
      say: L('After just ten generations: fifty-nine thousand people. But if masks, distancing or immunity push R below one, each generation is smaller than the last, and the outbreak fades away.',
        'Après seulement dix générations : cinquante-neuf mille personnes. Mais si les masques, la distanciation ou l’immunité font passer R sous un, chaque génération est plus petite que la précédente, et l’épidémie s’éteint.'),
    },
  ]);

  // Slide 3: SIR curves, then flattening.
  const DAYS = 160;
  const fast = sir(0.3, 0.1, DAYS), slow = sir(0.16, 0.1, DAYS);
  const sx = (d) => 100 + (760 * d) / DAYS, sy = (v) => 480 - 360 * v;
  const series = (data, key, color) => curve((d) => [sx(d), sy(data[Math.round(d)][key])], 0, DAYS, color, 80);
  const peakOf = (data) => data.reduce((best, p, d) => (p.i > best.i ? { d, i: p.i } : best), { d: 0, i: 0 });
  const pFast = peakOf(fast);
  const capacity = 0.12;
  const sirLesson = lesson(L('The epidemic curve', 'La courbe épidémique'), [
    {
      draw: [heading(L('The epidemic curve', 'La courbe épidémique')), ...axes(100, 480, 780, 380),
        T(860, 510, L('days', 'jours'), 22, { align: 'right' }), T(90, 120, '100%', 20, { align: 'right' }), T(90, 480, '0', 20, { align: 'right' }),
        series(fast, 's', 'blue'), T(sx(4), sy(fast[4].s) - 22, L('Susceptible', 'Sensibles'), 22, { color: 'blue' })],
      say: L('Let us follow a whole population. At first, almost everyone is susceptible: they have never met the virus. That is the blue curve.',
        'Suivons toute une population. Au début, presque tout le monde est sensible : personne n’a encore rencontré le virus. C’est la courbe bleue.'),
    },
    {
      draw: [series(fast, 'i', 'red'), T(sx(pFast.d), sy(pFast.i) - 22, L('Infected', 'Infectés'), 22, { align: 'center', color: 'red' })],
      say: L('The red curve is people infected right now. It creeps along for weeks, then explodes, peaks when a third of the population is sick at the same time, and falls as the virus runs out of new people.',
        'La courbe rouge, ce sont les personnes infectées à un instant donné. Elle rampe pendant des semaines, puis explose, culmine quand un tiers de la population est malade en même temps, et redescend quand le virus manque de nouvelles cibles.'),
    },
    {
      draw: [series(fast, 'r', 'green'), T(870, sy(fast[DAYS].r), L('Recovered', 'Rétablis'), 22, { color: 'green' })],
      say: L('And in green, the recovered, now immune. Susceptible, infected, recovered: that is the famous SIR model.',
        'Et en vert, les rétablis, désormais immunisés. Sensibles, infectés, rétablis : voilà le célèbre modèle SIR.'),
    },
    {
      draw: [line(100, sy(capacity), 860, sy(capacity), 'purple', 3), T(860, sy(capacity) - 18, L('hospital capacity', 'capacité des hôpitaux'), 20, { align: 'right', color: 'purple' }),
        series(slow, 'i', 'orange'), T(640, sy(capacity) - 18, L('with distancing', 'avec distanciation'), 22, { align: 'right', color: 'orange' })],
      say: L('Now halve the contacts. The orange curve comes later and much lower, under hospital capacity: fewer people sick at once, so everyone can be treated. That is flattening the curve.',
        'Réduisons maintenant les contacts de moitié. La courbe orange arrive plus tard et bien plus bas, sous la capacité des hôpitaux : moins de malades en même temps, donc tout le monde peut être soigné. C’est ça, aplatir la courbe.'),
    },
  ]);

  // Slide 4: primary vs secondary antibody response.
  const ax = (day) => 100 + day * 13, ay = (v) => 470 - 340 * v;
  const bump = (day, start, rise, height, fall) => (day < start ? 0 : height * Math.min(1, ((day - start) / rise) ** 2) * Math.exp(-Math.max(0, day - start - rise) / fall));
  const memory = lesson(L('Immune memory', 'La mémoire immunitaire'), [
    {
      draw: [heading(L('Immune memory', 'La mémoire immunitaire')), ...axes(100, 470, 800, 360),
        T(110, 90, L('antibodies', 'anticorps'), 22), T(900, 500, L('days', 'jours'), 22, { align: 'right' }),
        arrow(ax(4), 530, ax(4), 478, 'red', 3), T(ax(4), 545, L('1st exposure or vaccine', '1re exposition ou vaccin'), 20, { align: 'center', color: 'red' }),
        arrow(ax(32), 530, ax(32), 478, 'red', 3), T(ax(32), 545, L('2nd exposure', '2e exposition'), 20, { align: 'center', color: 'red' })],
      say: L('This chart shows the level of antibodies in the blood over time. We will meet the same germ twice.',
        'Ce graphique montre le taux d’anticorps dans le sang au fil du temps. Nous allons rencontrer deux fois le même microbe.'),
    },
    {
      draw: [curve((d) => [ax(d), ay(bump(d, 6, 8, 0.28, 5))], 0, 30, 'blue', 60), T(ax(14), ay(0.28) - 24, L('slow and weak', 'lente et faible'), 22, { align: 'center', color: 'blue' })],
      say: L('The first time, the immune system starts from scratch. It takes a week or two to find the right antibodies, and the response stays modest. Meanwhile, you may get sick.',
        'La première fois, le système immunitaire part de zéro. Il lui faut une à deux semaines pour trouver les bons anticorps, et la réponse reste modeste. Pendant ce temps, on peut tomber malade.'),
    },
    {
      draw: [curve((d) => [ax(d), ay(bump(d, 32, 4, 0.95, 9))], 30, 60, 'purple', 60), T(ax(37) + 16, ay(0.95), L('fast and strong: memory cells', 'rapide et forte : cellules mémoire'), 22, { color: 'purple' })],
      say: L('But the system kept memory cells. The second time, the response is faster and several times stronger. The germ is wiped out before it can make you ill.',
        'Mais le système a gardé des cellules mémoire. La deuxième fois, la réponse est plus rapide et plusieurs fois plus forte. Le microbe est éliminé avant de pouvoir nous rendre malade.'),
    },
    {
      draw: [T(130, 220, L('A vaccine = a safe first exposure', 'Vaccin = 1re exposition sans danger'), 22, { color: 'green' })],
      say: L('That is exactly what a vaccine does: it provides the first exposure without the disease, so that the real encounter triggers the fast, strong response.',
        'C’est exactement ce que fait un vaccin : il offre la première exposition sans la maladie, pour que la vraie rencontre déclenche directement la réponse rapide et forte.'),
    },
  ]);

  // Slide 5: herd immunity, a 7x7 grid then the threshold curve 1 - 1/R0.
  const open = new Set(['3,3', '3,4', '0,1', '1,5', '2,0', '4,6', '5,2', '6,4', '0,6', '6,0', '1,2', '5,5']); // not vaccinated
  const gx = (c) => 80 + 34 * c, gy = (r) => 150 + 34 * r;
  const cells = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) cells.push([r, c]);
  const hx = (R) => 580 + (360 * (R - 1)) / 15, hy = (p) => 470 - 300 * p;
  const herd = lesson(L('Herd immunity', 'Immunité collective'), [
    {
      draw: [heading(L('Herd immunity', 'Immunité collective')), ...cells.map(([r, c]) => circle(gx(c), gy(r), 11, 'black', '#ffffff', 2))],
      say: L('Picture a community of forty-nine people, all able to catch a disease.', 'Imaginons une communauté de quarante-neuf personnes, toutes susceptibles d’attraper une maladie.'),
    },
    {
      draw: [...cells.filter(([r, c]) => !open.has(`${r},${c}`)).map(([r, c]) => circle(gx(c), gy(r), 11, 'green', '#bfe8c8', 2)),
        T(60, 400, L('75% vaccinated', '75 % vaccinés'), 24, { color: 'green' })],
      say: L('Now vaccinate three quarters of them, in green.', 'Vaccinons maintenant les trois quarts d’entre elles, en vert.'),
    },
    {
      draw: [circle(gx(3), gy(3), 11, 'red', '#f28b8b', 2.5), line(gx(3), gy(3) + 11, gx(3), gy(4) - 11, 'red', 4), circle(gx(3), gy(4), 11, 'red', '#f28b8b', 2.5),
        T(60, 440, L('The virus finds no path', 'Le virus ne trouve pas de chemin'), 24, { color: 'red' })],
      say: L('One person brings the virus in. It reaches one unprotected neighbour, and then it is stuck: every other contact is immune. Even the unvaccinated are protected by the crowd around them.',
        'Une personne apporte le virus. Il atteint un voisin non protégé, puis il est bloqué : tous les autres contacts sont immunisés. Même les non-vaccinés sont protégés par la foule qui les entoure.'),
    },
    {
      draw: [...axes(580, 470, 380, 320), curve((R) => [hx(R), hy(1 - 1 / R)], 1, 16, 'blue', 60),
        M(760, 505, 'R_0', 24, { align: 'center' }), T(600, 175, L('% to immunize', '% à immuniser'), 20),
        M(850, 110, 'p = 1 - \\frac{1}{R_0}', 28, { align: 'center', color: 'blue' }),
        circle(hx(1.5), hy(1 / 3), 6, 'orange', 'orange'), T(hx(1.5) + 14, hy(1 / 3) + 14, L('flu', 'grippe'), 20, { color: 'orange' }),
        circle(hx(3), hy(2 / 3), 6, 'purple', 'purple'), T(hx(3) + 14, hy(2 / 3) + 10, 'COVID-19', 20, { color: 'purple' }),
        circle(hx(15), hy(1 - 1 / 15), 6, 'red', 'red'), T(hx(15), hy(1 - 1 / 15) - 24, L('measles', 'rougeole'), 20, { align: 'center', color: 'red' })],
      say: L('How many people must be immune? One minus one over R nought. Flu needs about a third, COVID around two thirds, and measles, the most contagious, about ninety-three percent.',
        'Combien de personnes doivent être immunisées ? Un moins un sur R zéro. Pour la grippe, environ un tiers, pour la COVID, deux tiers, et pour la rougeole, la plus contagieuse, environ quatre-vingt-treize pour cent.'),
    },
  ]);

  return {
    title: L('Viruses, epidemics and vaccines', 'Virus, épidémies et vaccins'),
    summary: L('From one infected cell to the epidemic curve, immune memory and herd immunity.', 'D’une cellule infectée à la courbe épidémique, la mémoire immunitaire et l’immunité collective.'),
    slides: [cell, spread, sirLesson, memory, herd],
    quiz: [
      { question: L('A virus multiplies by…', 'Un virus se multiplie en…'), options: [L('dividing in two', 'se divisant en deux'), L('hijacking a cell', 'détournant une cellule'), L('photosynthesis', 'faisant de la photosynthèse')], answer: 1 },
      { question: L('With R = 3, how many cases in generation 3?', 'Avec R = 3, combien de cas à la 3e génération ?'), options: ['27', '9', '6'], answer: 0 },
      { question: L('Flattening the curve mainly lowers…', 'Aplatir la courbe réduit surtout…'), options: [L('the total population', 'la population totale'), L('the size of the virus', 'la taille du virus'), L('the peak of infections', 'le pic d’infections')], answer: 2 },
      { question: L('The second immune response is faster thanks to…', 'La deuxième réponse immunitaire est plus rapide grâce…'), options: [L('memory cells', 'aux cellules mémoire'), L('fever', 'à la fièvre'), L('antibiotics', 'aux antibiotiques')], answer: 0 },
      { question: L('Herd immunity threshold for R0 = 4:', 'Seuil d’immunité collective pour R0 = 4 :'), options: ['25%', '75%', '40%'], answer: 1 },
    ],
  };
}

// --- Business: from price to profit --------------------------------------------------------

function business(L) {
  // Slide 1: supply and demand.
  const demandY = (x, shift = 0) => 130 + ((x - 170 - shift) * 320) / 610;
  const supplyY = (x) => 440 - ((x - 170) * 300) / 610;
  const market = lesson(L('Supply and demand', 'L’offre et la demande'), [
    {
      draw: [heading(L('Supply and demand', 'L’offre et la demande')), ...axes(120, 480, 760, 390),
        T(870, 510, L('quantity', 'quantité'), 22, { align: 'right' }), T(130, 75, L('price', 'prix'), 22),
        line(170, demandY(170), 780, demandY(780), 'blue', 4), M(790, 455, 'D', 26, { color: 'blue' })],
      say: L('Why does anything cost what it costs? Start with demand, in blue: the cheaper a product, the more people want it. The line slopes down.',
        'Pourquoi une chose coûte-t-elle ce qu’elle coûte ? Commençons par la demande, en bleu : plus un produit est bon marché, plus les gens en veulent. La droite descend.'),
    },
    {
      draw: [line(170, supplyY(170), 780, supplyY(780), 'red', 4), M(790, 135, 'S', 26, { color: 'red' })],
      say: L('Supply, in red, goes the other way: the higher the price, the more producers are willing to make and sell.',
        'L’offre, en rouge, va dans l’autre sens : plus le prix est élevé, plus les producteurs acceptent de fabriquer et de vendre.'),
    },
    {
      draw: [line(475, 290, 475, 480, '#888888', 2), line(120, 290, 475, 290, '#888888', 2), circle(475, 290, 9, 'green', 'green'),
        M(105, 290, 'P^*', 24, { align: 'right', color: 'green' }), M(475, 505, 'Q^*', 24, { align: 'center', color: 'green' }),
        T(485, 385, L('equilibrium', 'équilibre'), 22, { color: 'green' })],
      say: L('Where the two lines cross, buyers and sellers agree: that is the market equilibrium, which sets the price and the quantity sold.',
        'Là où les deux droites se croisent, acheteurs et vendeurs sont d’accord : c’est l’équilibre du marché, qui fixe le prix et la quantité vendue.'),
    },
    {
      draw: [line(290, demandY(290, 120), 860, demandY(860, 120), 'orange', 4), M(870, 429, "D'", 26, { color: 'orange' }),
        circle(537, 260, 9, 'orange', 'orange'), arrow(482, 285, 528, 263, 'orange', 3),
        T(960, 90, L('More demand: higher price, more sold', 'Plus de demande : prix plus haut, plus de ventes'), 22, { align: 'right', color: 'orange' })],
      say: L('Now a product goes viral and demand shifts right. The new equilibrium sits higher and further right: a higher price and more units sold. Every price you see is a balance like this one.',
        'Imaginons qu’un produit devienne viral : la demande se déplace vers la droite. Le nouvel équilibre est plus haut et plus à droite : un prix plus élevé et plus d’unités vendues. Chaque prix que vous voyez est un équilibre de ce genre.'),
    },
  ]);

  // Slide 2: break-even (fixed $10,000, unit cost $20, price $45 -> 400 units).
  const qx = (q) => 120 + q * 0.7, my = (m) => 480 - (m * 380) / 50000;
  const beX = qx(400), beY = my(18000);
  const breakEven = lesson(L('Break-even: when do you make money?', 'Seuil de rentabilité : quand gagne-t-on de l’argent ?'), [
    {
      draw: [heading(L('Break-even: when do you make money?', 'Seuil de rentabilité')), ...axes(120, 480, 760, 390),
        T(870, 510, L('units sold', 'unités vendues'), 22, { align: 'right' }), T(110, my(50000), '$50k', 20, { align: 'right' }), T(110, my(10000), '$10k', 20, { align: 'right' }),
        line(120, my(10000), 820, my(10000), 'purple', 3), T(826, my(10000), L('fixed costs', 'coûts fixes'), 22, { color: 'purple' })],
      say: L('You launch a product. Before selling a single unit, you pay fixed costs: rent, tools, salaries. Ten thousand dollars, whatever happens.',
        'Vous lancez un produit. Avant de vendre la moindre unité, vous payez des coûts fixes : loyer, outils, salaires. Dix mille dollars, quoi qu’il arrive.'),
    },
    {
      draw: [line(120, my(10000), 820, my(10000 + 20 * 1000), 'red', 4), T(826, my(30000), L('total cost', 'coût total'), 22, { color: 'red' }),
        line(120, my(0), 820, my(45 * 1000), 'blue', 4), T(826, my(45000), L('revenue', 'recettes'), 22, { color: 'blue' })],
      say: L('Each unit costs twenty dollars to make, so total cost climbs from ten thousand. Each unit sells for forty-five, so revenue starts at zero but climbs faster.',
        'Chaque unité coûte vingt dollars à produire : le coût total grimpe donc à partir de dix mille. Chaque unité se vend quarante-cinq dollars : les recettes partent de zéro, mais grimpent plus vite.'),
    },
    {
      draw: [circle(beX, beY, 9, 'green', 'green'), line(beX, beY, beX, 480, '#888888', 2),
        T(beX + 16, beY + 22, L('break-even: 400 units', 'seuil : 400 unités'), 22, { color: 'green' }),
        T(qx(95), my(8800), L('loss', 'perte'), 22, { align: 'center', color: 'red' }), T(qx(880), my(33200), 'profit', 24, { align: 'center', color: 'green' })],
      say: L('Where the lines cross is the break-even point: four hundred units. Below it, every sale still leaves you at a loss. Above it, every unit adds twenty-five dollars of profit.',
        'Là où les droites se croisent, c’est le seuil de rentabilité : quatre cents unités. En dessous, vous perdez encore de l’argent. Au-dessus, chaque unité ajoute vingt-cinq dollars de bénéfice.'),
    },
    {
      draw: [M(150, 125, `Q^* = \\frac{\\text{${L('fixed costs', 'coûts fixes')}}}{\\text{${L('price', 'prix')}} - \\text{${L('unit cost', 'coût unitaire')}}} = \\frac{10\\,000}{45 - 20} = 400`, 24)],
      say: L('The formula: fixed costs divided by the margin on each unit. Raise the price or cut the unit cost, and you break even much sooner.',
        'La formule : les coûts fixes divisés par la marge sur chaque unité. Augmentez le prix ou réduisez le coût unitaire, et vous devenez rentable bien plus tôt.'),
    },
  ]);

  // Slide 3: compound vs simple growth, $1,000 at 7% for 40 years.
  const yx = (t) => 120 + t * 18, vy = (v) => 480 - (v * 360) / 16000;
  const compound = lesson(L('Compound growth', 'Les intérêts composés'), [
    {
      draw: [heading(L('Compound growth', 'Les intérêts composés')), ...axes(120, 480, 760, 370),
        T(870, 510, L('years', 'années'), 22, { align: 'right' }), T(110, vy(15000), '$15k', 20, { align: 'right' }), T(110, vy(1000), '$1k', 20, { align: 'right' }),
        line(yx(0), vy(1000), yx(40), vy(1000 + 70 * 40), 'green', 4), T(830, vy(3800) - 22, L('simple: $3,800', 'simples : 3 800 $'), 22, { align: 'right', color: 'green' })],
      say: L('Invest one thousand dollars at seven percent a year. With simple interest, you earn seventy dollars every year: after forty years, three thousand eight hundred.',
        'Placez mille dollars à sept pour cent par an. Avec des intérêts simples, vous gagnez soixante-dix dollars chaque année : après quarante ans, trois mille huit cents.'),
    },
    {
      draw: [curve((t) => [yx(t), vy(1000 * 1.07 ** t)], 0, 40, 'blue', 60), T(820, 100, L('compound: $14,974', 'composés : 14 974 $'), 22, { align: 'right', color: 'blue' })],
      say: L('With compound interest, the interest itself earns interest. The curve starts slow, then takes off: fourteen thousand nine hundred seventy-four dollars. Almost four times more, from the same money.',
        'Avec des intérêts composés, les intérêts eux-mêmes rapportent des intérêts. La courbe démarre lentement, puis décolle : quatorze mille neuf cent soixante-quatorze dollars. Presque quatre fois plus, avec le même argent.'),
    },
    {
      draw: [10, 20, 30, 40].flatMap((t) => [circle(yx(t), vy(1000 * 1.07 ** t), 7, 'orange', 'orange'), T(yx(t), vy(1000 * 1.07 ** t) - 22, '×2', 22, { align: 'center', color: 'orange' })]),
      say: L('Notice the rhythm: the money doubles about every ten years. Two thousand, four thousand, eight thousand, fifteen thousand.',
        'Remarquez le rythme : l’argent double environ tous les dix ans. Deux mille, quatre mille, huit mille, quinze mille.'),
    },
    {
      draw: [M(160, 150, 'A = P\\,(1 + r)^t', 30, { color: 'blue' }), T(160, 205, L('Rule of 72: 72 / 7 = about 10 years to double', 'Règle de 72 : 72 / 7 = environ 10 ans pour doubler'), 22)],
      say: L('The formula is A equals P times one plus r, to the power t. And a handy shortcut, the rule of seventy-two: divide seventy-two by the rate to get the doubling time. Start early: time is the exponent.',
        'La formule : A égale P fois un plus r, puissance t. Et un raccourci pratique, la règle de soixante-douze : divisez soixante-douze par le taux pour obtenir le temps de doublement. Commencez tôt : le temps est dans l’exposant.'),
    },
  ]);

  // Slide 4: diffusion of innovations (bell curve + S-curve).
  const mu = 500, sd = 120, base = 420;
  const gauss = (x) => Math.exp(-(((x - mu) / sd) ** 2) / 2);
  const cdf = (x) => { // normal CDF (Abramowitz-Stegun)
    const z = (x - mu) / sd, t = 1 / (1 + 0.2316419 * Math.abs(z));
    const p = 1 - 0.3989423 * Math.exp(-z * z / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z >= 0 ? p : 1 - p;
  };
  const groups = [
    [L('Innovators', 'Innovateurs'), 190, 445, '2.5%'], [L('Early adopters', 'Adopteurs précoces'), 320, 475, '13.5%'],
    [L('Early majority', 'Majorité précoce'), 440, 445, '34%'], [L('Late majority', 'Majorité tardive'), 560, 475, '34%'],
    [L('Laggards', 'Retardataires'), 760, 445, '16%'],
  ];
  const adoption = lesson(L('Who buys first? The adoption curve', 'Qui achète en premier ? La courbe d’adoption'), [
    {
      draw: [heading(L('Who buys first? The adoption curve', 'La courbe d’adoption')), line(120, base, 880, base, 'black', 3),
        curve((x) => [x, base - 250 * gauss(x)], 120, 880, 'blue', 80)],
      say: L('When a new product appears, people do not all buy it at once. Adoption over time follows a bell curve.',
        'Quand un nouveau produit apparaît, tout le monde ne l’achète pas en même temps. L’adoption dans le temps suit une courbe en cloche.'),
    },
    {
      draw: [...[260, 380, 500, 620].map((x) => line(x, base, x, base - 250 * gauss(x), 'blue', 2)),
        ...groups.flatMap(([name, x, y, pct]) => [T(x, y, name, 20, { align: 'center' }), T(x === 190 ? 195 : x === 760 ? 700 : x, x === 190 ? 380 : 400, pct, 20, { align: 'center', color: 'blue' })])],
      say: L('First the innovators, two and a half percent, who love anything new. Then the early adopters, the opinion leaders. Then the big early and late majorities, and finally the laggards.',
        'D’abord les innovateurs, deux et demi pour cent, fans de toute nouveauté. Puis les adopteurs précoces, les leaders d’opinion. Ensuite les grandes majorités précoce et tardive, et enfin les retardataires.'),
    },
    {
      draw: [curve((x) => [x, base - 300 * cdf(x)], 120, 880, 'orange', 80), T(870, 100, L('total adopters', 'adopteurs cumulés'), 22, { align: 'right', color: 'orange' })],
      say: L('Add them up over time and you get the famous S-curve of market share: slow start, rapid growth, then saturation. Smartphones, the internet and electric cars all followed it.',
        'En les cumulant, on obtient la célèbre courbe en S de la part de marché : démarrage lent, croissance rapide, puis saturation. Les smartphones, internet et les voitures électriques l’ont tous suivie.'),
    },
    {
      draw: [line(380, 150, 380, base, 'red', 5), T(380, 132, L('the chasm', 'le gouffre'), 24, { align: 'center', color: 'red' })],
      say: L('The hardest step is here, between the early adopters and the early majority: the chasm. Enthusiasts buy promises, the majority buys proof. Many startups die exactly at this line.',
        'L’étape la plus difficile est ici, entre les adopteurs précoces et la majorité précoce : le gouffre. Les passionnés achètent des promesses, la majorité achète des preuves. Beaucoup de start-up meurent exactement sur cette ligne.'),
    },
  ]);

  // Slide 5: sales funnel and unit economics.
  const stages = [
    [L('Visitors: 10,000', 'Visiteurs : 10 000'), 520], [L('Sign-ups: 1,000', 'Inscrits : 1 000'), 400],
    [L('Trials: 300', 'Essais : 300'), 290], [L('Customers: 60', 'Clients : 60'), 200],
  ];
  const FX = 290; // funnel centre
  const band = (i) => {
    const top = 100 + 80 * i, w1 = stages[i][1], w2 = stages[i + 1]?.[1] ?? 140;
    return path(`M ${FX - w1 / 2} ${top} L ${FX + w1 / 2} ${top} L ${FX + w2 / 2} ${top + 70} L ${FX - w2 / 2} ${top + 70} Z`, 'blue', 3, i === 3 ? '#dcf2e2' : '#e6eefc');
  };
  const rates = [L('10% sign up', '10 % s’inscrivent'), L('30% try it', '30 % essaient'), L('20% buy', '20 % achètent')];
  const funnel = lesson(L('The sales funnel', 'L’entonnoir de vente'), [
    {
      draw: [heading(L('The sales funnel', 'L’entonnoir de vente')), ...stages.flatMap(([label], i) => [band(i), T(FX, 135 + 80 * i, label, 22, { align: 'center' })])],
      say: L('Every business is a funnel. Ten thousand people visit the website. A thousand sign up, three hundred try the product, and sixty become paying customers.',
        'Toute entreprise est un entonnoir. Dix mille personnes visitent le site. Mille s’inscrivent, trois cents essaient le produit, et soixante deviennent des clients payants.'),
    },
    {
      draw: rates.map((txt, i) => T(FX + stages[i + 1][1] / 2 + 14, 175 + 80 * i, txt, 22, { color: 'orange' })), // at the funnel's edge
      say: L('Each step keeps only a fraction. These conversion rates are where the money is.', 'Chaque étape n’en garde qu’une fraction. Ces taux de conversion, c’est là que se trouve l’argent.'),
    },
    {
      draw: [M(830, 250, '\\text{LTV} = \\$30 \\times 24 = \\$720', 24, { align: 'center' }),
        M(830, 320, '\\text{CAC} = \\frac{\\$5\\,000}{60} \\approx \\$83', 24, { align: 'center' })],
      say: L('Two numbers decide if the business works. Lifetime value: a customer pays thirty dollars a month for two years, seven hundred twenty dollars. Acquisition cost: five thousand dollars of ads for sixty customers, about eighty-three each.',
        'Deux nombres décident si l’entreprise fonctionne. La valeur vie client : un client paie trente dollars par mois pendant deux ans, soit sept cent vingt dollars. Le coût d’acquisition : cinq mille dollars de publicité pour soixante clients, environ quatre-vingt-trois chacun.'),
    },
    {
      draw: [M(830, 400, '\\frac{\\text{LTV}}{\\text{CAC}} \\approx 8.7', 26, { align: 'center', color: 'green' }),
        T(830, 460, L('above 3: a healthy business', 'au-dessus de 3 : entreprise saine'), 22, { align: 'center', color: 'green' }),
        T(60, 525, L('Double one conversion rate: twice the customers, same ad budget.', 'Doublez un taux de conversion : deux fois plus de clients, même budget.'), 22)],
      say: L('Each customer brings almost nine times what it cost to win them. Above three is healthy. And the lever: double any single conversion rate, and you double your customers without spending a cent more.',
        'Chaque client rapporte presque neuf fois ce qu’il a coûté. Au-dessus de trois, c’est sain. Et le levier : doublez un seul taux de conversion, et vous doublez vos clients sans dépenser un centime de plus.'),
    },
  ]);

  return {
    title: L('Business: from price to profit', 'Business : du prix au profit'),
    summary: L('Supply and demand, break-even, compound growth, the adoption curve and the sales funnel.', 'Offre et demande, seuil de rentabilité, intérêts composés, courbe d’adoption et entonnoir de vente.'),
    slides: [market, breakEven, compound, adoption, funnel],
    quiz: [
      { question: L('Demand rises, supply unchanged: the price…', 'La demande augmente, l’offre ne bouge pas : le prix…'), options: [L('rises', 'monte'), L('falls', 'baisse'), L('stays the same', 'ne change pas')], answer: 0 },
      { question: L('Fixed $10,000, price $45, unit cost $20: break-even at…', 'Fixes 10 000 $, prix 45 $, coût 20 $ : rentable à…'), options: [L('222 units', '222 unités'), L('500 units', '500 unités'), L('400 units', '400 unités')], answer: 2 },
      { question: L('At 7% a year, money doubles in about…', 'À 7 % par an, l’argent double en environ…'), options: [L('7 years', '7 ans'), L('10 years', '10 ans'), L('20 years', '20 ans')], answer: 1 },
      { question: L('The gap between early adopters and the majority is…', 'Le fossé entre adopteurs précoces et majorité, c’est…'), options: [L('the chasm', 'le gouffre'), L('the funnel', 'l’entonnoir'), L('the plateau', 'le plateau')], answer: 0 },
      { question: L('A healthy LTV / CAC ratio is usually…', 'Un ratio LTV / CAC sain est en général…'), options: [L('below 1', 'sous 1'), L('exactly 1', 'égal à 1'), L('above 3', 'au-dessus de 3')], answer: 2 },
    ],
  };
}

// --- Catalogue --------------------------------------------------------------------------------

const BUILDERS = [
  { id: 'cs', icon: '💻', field: { en: 'Computer science', fr: 'Informatique' }, build: computerScience },
  { id: 'bio', icon: '🧬', field: { en: 'Biology', fr: 'Biologie' }, build: biology },
  { id: 'biz', icon: '📈', field: { en: 'Business', fr: 'Business' }, build: business },
];
export const FREE_LANGS = ['en', 'fr'];

const cache = new Map();

/** Lecture `id` in `lang`: { id, icon, field, title, summary, slides: [{ title, spec, narration }], quiz }, or null. */
export function freeLecture(id, lang) {
  lang = FREE_LANGS.includes(lang) ? lang : 'en';
  const key = `${id}:${lang}`;
  if (!cache.has(key)) {
    const b = BUILDERS.find((x) => x.id === id);
    if (!b) return null;
    const L = (en, fr) => (lang === 'fr' ? fr : en);
    cache.set(key, { id, icon: b.icon, field: b.field[lang], lang, ...b.build(L) });
  }
  return cache.get(key);
}

/** Every free lecture in `lang`, in menu order. */
export const freeLectures = (lang) => BUILDERS.map((b) => freeLecture(b.id, lang));

/** Every narration text of every free lecture (the server caches their voice). */
export const freeNarrationTexts = () => new Set(FREE_LANGS.flatMap((lang) => freeLectures(lang)
  .flatMap((l) => l.slides.flatMap((s) => s.narration.map((n) => n.text)))));
