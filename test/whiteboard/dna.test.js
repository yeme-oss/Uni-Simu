import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complement, dnaStrandPair, replicationFork, armDirection5to3, REPLICATION_FORK_PARTS } from '../../src/whiteboard/components/dna.js';
import { sub, dot, norm, len } from '../../src/whiteboard/geometry.js';

const VALID_PAIRS = new Set(['AT', 'TA', 'GC', 'CG']);
const dir = (from, to) => norm(sub(to, from));
const FORK = { x: 60, y: 50, width: 880, height: 470, sequence: 'TACGGATCAG', fragments: 3 };

/** Distance from point p to the segment a-b. */
function distToSegment(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]));
}

test('complement pairs A–T and G–C and rejects anything else', () => {
  assert.deepEqual(['A', 'T', 'G', 'C'].map(complement), ['T', 'A', 'C', 'G']);
  assert.throws(() => complement('U'), /invalid base "U"/);
});

for (const orientation of ['5to3', '3to5']) {
  test(`dnaStrandPair (${orientation}): every drawn base pair is A–T or G–C`, () => {
    const { primitives, meta } = dnaStrandPair({ sequence: 'ATGCGTTACCAG', x: 100, y: 100, length: 600, orientation });
    const top = primitives.filter((p) => p.role === 'base-top');
    const bottom = primitives.filter((p) => p.role === 'base-bottom');
    assert.equal(top.length, 12);
    assert.equal(bottom.length, 12);
    for (const t of top) {
      const b = bottom.find((p) => p.x === t.x); // the letter drawn directly below
      assert.ok(b, `no partner drawn under ${t.text} at x=${t.x}`);
      assert.ok(VALID_PAIRS.has(t.text + b.text), `invalid pair ${t.text}-${b.text}`);
    }
    for (const [a, b] of meta.pairs) assert.ok(VALID_PAIRS.has(a + b));
  });

  test(`dnaStrandPair (${orientation}): strands are antiparallel and labelled at the right ends`, () => {
    const { primitives, meta } = dnaStrandPair({ sequence: 'ATGC', x: 100, y: 100, length: 400, orientation });
    assert.ok(dot(dir(meta.top.from5, meta.top.to3), dir(meta.bottom.from5, meta.bottom.to3)) < -0.99);
    // A 5′ label is drawn next to each strand's 5′ end, a 3′ label next to its 3′ end.
    for (const strand of [meta.top, meta.bottom]) {
      for (const [end, prime] of [[strand.from5, '5′'], [strand.to3, '3′']]) {
        const label = primitives.find((p) => p.type === 'text' && p.text === prime && p.y === end[1] && Math.abs(p.x - end[0]) <= 12);
        assert.ok(label, `missing ${prime} label at (${end})`);
      }
    }
    // Direction arrows point to the 3′ ends.
    const topArrow = primitives.find((p) => p.role === 'strand-top');
    assert.deepEqual([topArrow.x2, topArrow.y2], meta.top.to3);
    // Reading both strands 5′→3′ gives reverse complements.
    const revComp = [...meta.top.sequence].reverse().map(complement).join('');
    assert.equal(meta.bottom.sequence, revComp);
  });
}

test('replicationFork: parental duplex pairs are all A–T or G–C, drawn and computed', () => {
  const { primitives, meta } = replicationFork(FORK);
  const top = primitives.filter((p) => p.role === 'base-top');
  const bottom = primitives.filter((p) => p.role === 'base-bottom');
  assert.equal(top.length, FORK.sequence.length);
  top.forEach((t, i) => assert.ok(VALID_PAIRS.has(t.text + bottom[i].text), `invalid pair ${t.text}-${bottom[i].text}`));
  meta.duplex.pairs.forEach(([a, b]) => assert.ok(VALID_PAIRS.has(a + b)));
});

test('replicationFork: all strands are antiparallel to their partner', () => {
  const { meta } = replicationFork(FORK);
  const { templates, leading, lagging } = meta;
  // Parental duplex.
  assert.ok(dot(dir(meta.duplex.top.from5, meta.duplex.top.to3), dir(meta.duplex.bottom.from5, meta.duplex.bottom.to3)) < -0.99);
  // The two templates run in opposite directions along the duplex (top 5′ end is on the right).
  assert.ok(templates.top.from5[0] > templates.top.arm.from[0], 'top template 5′ end should be ahead of the fork');
  assert.ok(templates.bottom.to3[0] > templates.bottom.arm.from[0], 'bottom template 3′ end should be ahead of the fork');
  // The duplex's computed polarity agrees with the templates it continues into.
  assert.ok(dot(dir(meta.duplex.top.from5, meta.duplex.top.to3), [-1, 0]) > 0.99, 'duplex top strand must run 5′→3′ toward the fork');
  assert.ok(dot(dir(meta.duplex.bottom.from5, meta.duplex.bottom.to3), [1, 0]) > 0.99, 'duplex bottom strand must run 5′→3′ away from the fork');
  // New strands vs their templates, on the arms.
  assert.ok(dot(dir(leading.from5, leading.to3), armDirection5to3(templates.top)) < -0.99, 'leading strand must be antiparallel to its template');
  for (const f of lagging.fragments) {
    assert.ok(dot(dir(f.from5, f.to3), armDirection5to3(templates.bottom)) < -0.99, 'Okazaki fragment must be antiparallel to its template');
  }
});

test('replicationFork: drawn 5′/3′ labels sit at the matching template ends', () => {
  const { primitives, meta } = replicationFork(FORK);
  const labelAt = (pt) => primitives.find((p) => p.type === 'text' && /^[35]′$/.test(p.text) && Math.abs(p.y - pt[1]) < 1 && Math.abs(p.x - pt[0]) <= 12)?.text;
  assert.equal(labelAt(meta.templates.top.from5), '5′');
  assert.equal(labelAt(meta.templates.top.to3), '3′');
  assert.equal(labelAt(meta.templates.bottom.from5), '5′');
  assert.equal(labelAt(meta.templates.bottom.to3), '3′');
});

test('replicationFork: the leading-strand arrow points 5′→3′ toward the fork', () => {
  const { primitives, meta } = replicationFork(FORK);
  const arrows = primitives.filter((p) => p.role === 'leading');
  assert.equal(arrows.length, 1, 'leading strand is one continuous arrow');
  const [a] = arrows;
  const tail = [a.x1, a.y1], tip = [a.x2, a.y2];
  assert.deepEqual(tail, meta.leading.from5, 'arrow starts at the 5′ end');
  assert.deepEqual(tip, meta.leading.to3, 'arrowhead is the 3′ end');
  assert.ok(len(sub(meta.fork, tip)) < len(sub(meta.fork, tail)), 'the 3′ end is nearer the fork');
  assert.ok(dot(sub(tip, tail), sub(meta.fork, tail)) > 0, 'arrow heads toward the fork');
});

test('replicationFork: Okazaki fragments (with RNA primers) exist only on the lagging strand', () => {
  const { primitives, meta } = replicationFork({ ...FORK, fragments: 4 });
  const topArm = meta.templates.top.arm, bottomArm = meta.templates.bottom.arm;
  const fragments = primitives.filter((p) => p.role === 'okazaki');
  const primers = primitives.filter((p) => p.role === 'primer');
  assert.equal(fragments.length, 4);
  assert.equal(primers.length, 4);
  for (const p of [...fragments, ...primers]) {
    for (const pt of [[p.x1, p.y1], [p.x2, p.y2]]) {
      const toLagging = distToSegment(pt, bottomArm.from, bottomArm.to);
      const toLeading = distToSegment(pt, topArm.from, topArm.to);
      assert.ok(toLagging < 30, `${p.role} point ${pt} is not on the lagging arm`);
      assert.ok(toLeading > 60, `${p.role} point ${pt} is too close to the leading arm`);
    }
  }
  // Each fragment grows 5′→3′ away from the fork, primer at its 5′ (fork-side) end.
  for (const f of meta.lagging.fragments) {
    assert.ok(len(sub(meta.fork, f.to3)) > len(sub(meta.fork, f.from5)));
    assert.deepEqual(f.primer.from, f.from5);
  }
  // The leading strand has no fragments or primers.
  assert.equal(primitives.filter((p) => p.role === 'leading').length, 1);
});

test('replicationFork: parts draw subsets with identical geometry', () => {
  const all = replicationFork(FORK).primitives;
  const pieces = REPLICATION_FORK_PARTS.flatMap((part) => replicationFork({ ...FORK, parts: [part] }).primitives);
  assert.deepEqual(pieces.map((p) => JSON.stringify(p)).sort(), all.map((p) => JSON.stringify(p)).sort());
  assert.ok(replicationFork({ ...FORK, parts: ['helicase'] }).primitives.some((p) => p.role === 'helicase'));
  assert.ok(!replicationFork({ ...FORK, parts: ['helicase'] }).primitives.some((p) => p.role === 'okazaki'));
});
