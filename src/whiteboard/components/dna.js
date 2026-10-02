// DNA domain components. The rules live here, not in the LLM's spec:
// complementary bases are computed (A–T, G–C), strands are antiparallel,
// 5′/3′ labels and fork polarity are derived from geometry. Each component
// returns { primitives, meta }; meta describes the structure for tests.
import { add, sub, scale, norm, perp, lerp, dot } from '../geometry.js';

const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
const PRIME = '′';

export const complement = (base) => {
  const c = PAIR[base.toUpperCase()];
  if (!c) throw new Error(`invalid base "${base}" (expected A, C, G or T)`);
  return c;
};
export const reverse = (s) => [...s].reverse().join('');

const text = (x, y, value, extra = {}) => ({ type: 'text', x, y, text: value, ...extra });
const line = (a, b, extra = {}) => ({ type: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], ...extra });
const arrow = (a, b, extra = {}) => ({ type: 'arrow', x1: a[0], y1: a[1], x2: b[0], y2: b[1], ...extra });

/**
 * A double-stranded DNA segment drawn horizontally.
 * `sequence` is the top strand written left to right; `orientation` says which
 * way the top strand runs: '5to3' (5′ on the left) or '3to5'. The bottom strand
 * is its computed complement, running the opposite way.
 * Options: gap (distance between strands), backbone (draw strand lines),
 * labels ('both' | 'left' | 'right' | 'none'), showDirection (arrowheads at 3′ ends).
 */
export function dnaStrandPair({
  sequence, x, y, length, orientation = '5to3', gap = 80,
  backbone = true, labels = 'both', showDirection = true,
  color = 'black', baseColor = 'blue', textSize = 22,
}) {
  const top = sequence.toUpperCase();
  const bottom = [...top].map(complement).join(''); // left to right, under each top base
  const n = top.length;
  const topY = y, bottomY = y + gap;
  const left = x, right = x + length;
  const topRunsRight = orientation === '5to3';

  const primitives = [];
  const ends = (y0, runsRight) => (runsRight
    ? { from5: [left, y0], to3: [right, y0] }
    : { from5: [right, y0], to3: [left, y0] });
  const topEnds = ends(topY, topRunsRight);
  const bottomEnds = ends(bottomY, !topRunsRight);

  if (backbone) {
    const draw = showDirection ? arrow : line;
    primitives.push(draw(topEnds.from5, topEnds.to3, { color, role: 'strand-top' }));
    primitives.push(draw(bottomEnds.from5, bottomEnds.to3, { color, role: 'strand-bottom' }));
  }

  // Base pairs: letters on each strand joined by a hydrogen-bond rung.
  const step = length / n;
  for (let i = 0; i < n; i++) {
    const bx = x + (i + 0.5) * step;
    primitives.push(text(bx, topY + 18, top[i], { size: textSize, align: 'center', color: baseColor, role: 'base-top' }));
    primitives.push(line([bx, topY + 31], [bx, bottomY - 31], { color: 'black', width: 1.5, role: 'rung' }));
    primitives.push(text(bx, bottomY - 18, bottom[i], { size: textSize, align: 'center', color: baseColor, role: 'base-bottom' }));
  }

  // 5′/3′ labels at the strand ends.
  const label = (end, prime) => {
    const [ex, ey] = end;
    const onLeft = ex === left;
    return text(onLeft ? ex - 10 : ex + 10, ey, `${prime}${PRIME}`, { size: textSize, align: onLeft ? 'right' : 'left', role: `label-${prime}` });
  };
  const wantLabel = (end) => labels === 'both' || (labels === 'left' && end[0] === left) || (labels === 'right' && end[0] === right);
  for (const ends_ of [topEnds, bottomEnds]) {
    if (wantLabel(ends_.from5)) primitives.push(label(ends_.from5, 5));
    if (wantLabel(ends_.to3)) primitives.push(label(ends_.to3, 3));
  }

  return {
    primitives,
    meta: {
      top: { sequence: topRunsRight ? top : reverse(top), ...topEnds },       // sequences read 5′→3′
      bottom: { sequence: topRunsRight ? reverse(bottom) : bottom, ...bottomEnds },
      pairs: [...top].map((b, i) => [b, bottom[i]]),
    },
  };
}

export const REPLICATION_FORK_PARTS = ['duplex', 'templates', 'helicase', 'topoisomerase', 'ssb', 'leading', 'lagging', 'labels'];

/** Words the fork writes on the board, per language (standard textbook terms). */
export const FORK_LABELS = {
  en: {
    helicase: 'helicase', topoisomerase: 'topoisomerase', ssb: 'SSB', leading: 'leading strand', lagging: 'lagging strand',
    primer: 'RNA primer', okazaki: 'Okazaki fragment', forkMoves: 'fork moves',
  },
  fr: {
    helicase: 'hélicase', topoisomerase: 'topoisomérase', ssb: 'SSB', leading: 'brin précoce', lagging: 'brin tardif',
    primer: "amorce d'ARN", okazaki: "fragment d'Okazaki", forkMoves: 'la fourche avance',
  },
};

/**
 * A replication fork moving to the right, fitted in the box (x, y, width, height).
 * Parental duplex on the right, separated template strands (arms) on the left.
 * Polarity is fixed by chemistry: the top template runs 3′ (left) → 5′ (right), so the
 * top arm carries the continuous leading strand (5′→3′ toward the fork) and the
 * bottom arm the lagging strand as Okazaki fragments (5′→3′ away from the fork),
 * each starting with an RNA primer. Helicase sits at the fork, SSB on the lagging
 * single-stranded template, topoisomerase ahead of the fork.
 * `parts` selects what to draw, so a diagram can build up over several steps
 * (same geometry parameters give the same geometry).
 */
export function replicationFork({
  x, y, width, height, sequence = 'TACGGATC', forkAt = 0.45, fragments = 3, lang = 'en',
  parts = REPLICATION_FORK_PARTS, textSize = 24,
}) {
  const words = FORK_LABELS[lang] ?? FORK_LABELS.en;
  const want = new Set(parts);
  const primitives = [];
  const cy = y + height / 2;
  const gap = 80;
  const F = [x + width * forkAt, cy];                     // fork point
  const rightEnd = x + width - 40;                        // room for the 5′/3′ labels
  const armEndX = x + 40;
  const spread = height / 2 - 30;

  // Template strands. Top: 3′ at the arm end ... 5′ at the right end. Bottom: the reverse.
  const topJunction = [F[0], cy - gap / 2];
  const bottomJunction = [F[0], cy + gap / 2];
  const topArmEnd = [armEndX, cy - spread];
  const bottomArmEnd = [armEndX, cy + spread];
  const uTop = norm(sub(topArmEnd, topJunction));         // along top arm, away from the fork
  const uBottom = norm(sub(bottomArmEnd, bottomJunction));
  // Unit normals pointing into the fork (between the arms).
  const inward = (u, towardY) => { const n = perp(u); return n[1] * towardY > 0 ? n : scale(n, -1); };
  const nTop = inward(uTop, 1);
  const nBottom = inward(uBottom, -1);
  const onArm = (junction, end, t, n, offset) => add(lerp(junction, end, t), scale(n, offset));
  const NEW_STRAND_OFFSET = 26;

  // Duplex ahead of the fork; topoisomerase sits on it, bases fill the space before it.
  const topoX = F[0] + (rightEnd - F[0]) * 0.74;
  const duplexTop = [[F[0], cy - gap / 2], [rightEnd, cy - gap / 2]];
  const duplexBottom = [[F[0], cy + gap / 2], [rightEnd, cy + gap / 2]];
  const basesFrom = F[0] + 46, basesTo = topoX - 34;
  const pair = dnaStrandPair({
    sequence, x: basesFrom, y: cy - gap / 2, length: basesTo - basesFrom, orientation: '3to5', gap,
    backbone: false, labels: 'none', textSize,
  });

  if (want.has('duplex')) {
    primitives.push(line(...duplexTop, { role: 'template-top' }));
    primitives.push(line(...duplexBottom, { role: 'template-bottom' }));
    primitives.push(...pair.primitives);
    primitives.push(text(rightEnd + 10, cy - gap / 2, `5${PRIME}`, { size: textSize, role: 'label-5' }));
    primitives.push(text(rightEnd + 10, cy + gap / 2, `3${PRIME}`, { size: textSize, role: 'label-3' }));
  }

  if (want.has('templates')) {
    primitives.push(line(topJunction, topArmEnd, { role: 'template-top' }));
    primitives.push(line(bottomJunction, bottomArmEnd, { role: 'template-bottom' }));
    primitives.push(text(armEndX - 10, topArmEnd[1], `3${PRIME}`, { size: textSize, align: 'right', role: 'label-3' }));
    primitives.push(text(armEndX - 10, bottomArmEnd[1], `5${PRIME}`, { size: textSize, align: 'right', role: 'label-5' }));
  }

  if (want.has('helicase')) {
    primitives.push({ type: 'circle', cx: F[0], cy: F[1], r: gap / 2 + 12, color: 'green', width: 4, role: 'helicase' });
    primitives.push(text(F[0] + 12, cy - gap / 2 - 38, words.helicase, { size: textSize, color: 'green', role: 'label' }));
  }

  if (want.has('topoisomerase')) {
    primitives.push({ type: 'rect', x: topoX - 18, y: cy - gap / 2 - 16, w: 36, h: gap + 32, color: 'purple', width: 4, role: 'topoisomerase' });
    primitives.push(text(topoX, cy - gap / 2 - 36, words.topoisomerase, { size: textSize, align: 'center', color: 'purple', role: 'label' }));
  }

  // Lagging arm layout (fractions along the bottom arm, from the fork outwards):
  // single-stranded template with SSB near the fork, then Okazaki fragments.
  const SSB_FROM = 0.14, SSB_TO = 0.3, FRAG_FROM = 0.34, FRAG_TO = 0.97, FRAG_GAP = 0.035;
  const armLength = Math.hypot(...sub(bottomArmEnd, bottomJunction));

  if (want.has('ssb')) {
    for (let k = 0; k < 3; k++) {
      const [cx, cy_] = onArm(bottomJunction, bottomArmEnd, SSB_FROM + ((SSB_TO - SSB_FROM) * k) / 2, nBottom, 0);
      primitives.push({ type: 'circle', cx, cy: cy_, r: 8, color: 'orange', width: 3, fill: 'orange', role: 'ssb' });
    }
    const [lx, ly] = onArm(bottomJunction, bottomArmEnd, (SSB_FROM + SSB_TO) / 2, nBottom, 30);
    primitives.push(text(lx, ly, words.ssb, { size: textSize, align: 'center', color: 'orange', role: 'label' }));
  }

  // Leading strand: continuous, 5′ far from the fork, growing 5′→3′ toward it.
  const leading5 = onArm(topJunction, topArmEnd, 0.93, nTop, NEW_STRAND_OFFSET);
  const leading3 = onArm(topJunction, topArmEnd, 0.16, nTop, NEW_STRAND_OFFSET);
  if (want.has('leading')) {
    primitives.push(arrow(leading5, leading3, { color: 'blue', width: 4, role: 'leading' }));
    primitives.push(text(leading5[0] - 6, leading5[1] + 20, `5${PRIME}`, { size: textSize, align: 'right', color: 'blue', role: 'label-5' }));
  }

  // Lagging strand: Okazaki fragments, each 5′ (fork side, RNA primer) → 3′ (away from the fork).
  const fragmentMeta = [];
  const span = (FRAG_TO - FRAG_FROM - FRAG_GAP * (fragments - 1)) / fragments;
  const primerT = 22 / armLength;
  for (let k = 0; k < fragments; k++) {
    const t5 = FRAG_FROM + k * (span + FRAG_GAP);
    const t3 = t5 + span;
    const from5 = onArm(bottomJunction, bottomArmEnd, t5, nBottom, NEW_STRAND_OFFSET);
    const primerEnd = onArm(bottomJunction, bottomArmEnd, t5 + primerT, nBottom, NEW_STRAND_OFFSET);
    const to3 = onArm(bottomJunction, bottomArmEnd, t3, nBottom, NEW_STRAND_OFFSET);
    fragmentMeta.push({ from5, to3, primer: { from: from5, to: primerEnd } });
    if (want.has('lagging')) {
      primitives.push(line(from5, primerEnd, { color: 'red', width: 7, role: 'primer' }));
      primitives.push(arrow(primerEnd, to3, { color: 'blue', width: 4, role: 'okazaki' }));
    }
  }

  if (want.has('labels')) {
    const [lx, ly] = onArm(topJunction, topArmEnd, 0.55, nTop, 80);
    primitives.push(text(lx, ly, words.leading, { size: textSize + 2, align: 'center', color: 'blue', role: 'label' }));
    const [gx, gy] = onArm(bottomJunction, bottomArmEnd, 0.58, nBottom, 84);
    primitives.push(text(gx, gy, words.lagging, { size: textSize + 2, align: 'center', color: 'blue', role: 'label' }));
    // Labels below the lagging arm, each with a pointer: the primer of the fragment
    // nearest the fork, and a fragment further out.
    const pointTo = (target, label, value, color) => {
      primitives.push(text(label[0], label[1], value, { size: textSize, align: 'center', color, role: 'label' }));
      const start = [label[0], label[1] - textSize * 0.7];
      primitives.push(line(start, lerp(start, target, 0.85), { color, width: 2, role: 'pointer' }));
    };
    const firstPrimer = fragmentMeta[0].primer;
    const primerMid = lerp(firstPrimer.from, firstPrimer.to, 0.5);
    pointTo(primerMid, add(primerMid, [40, 96]), words.primer, 'red');
    const frag = fragmentMeta[Math.min(fragmentMeta.length - 1, 2)];
    const fragMid = lerp(frag.from5, frag.to3, 0.5);
    pointTo(fragMid, add(fragMid, [70, 84]), words.okazaki, 'black');
    // Direction of fork movement.
    primitives.push(arrow([rightEnd - 150, y + 8], [rightEnd - 20, y + 8], { width: 3, role: 'fork-direction' }));
    primitives.push(text(rightEnd - 160, y + 8, words.forkMoves, { size: textSize, align: 'right', role: 'label' }));
  }

  return {
    primitives,
    meta: {
      fork: F,
      direction: [1, 0],
      duplex: pair.meta,
      templates: {
        // Each template read 5′→3′: top from its 5′ (right) end to its 3′ (arm) end.
        top: { from5: duplexTop[1], to3: topArmEnd, arm: { from: topJunction, to: topArmEnd } },
        bottom: { from5: bottomArmEnd, to3: duplexBottom[1], arm: { from: bottomJunction, to: bottomArmEnd } },
      },
      leading: { template: 'top', from5: leading5, to3: leading3 },
      lagging: { template: 'bottom', fragments: fragmentMeta },
    },
  };
}

/** Direction (unit vector) of the part of a template strand that lies on its arm, read 5′→3′. */
export function armDirection5to3(template) {
  const { from, to } = template.arm; // `from` = junction at the fork, `to` = arm end
  const awayFromFork = norm(sub(to, from));
  // Top template's 3′ end is the arm end; bottom template's 5′ end is the arm end.
  return dot(sub(template.to3, template.from5), awayFromFork) > 0 ? awayFromFork : scale(awayFromFork, -1);
}
