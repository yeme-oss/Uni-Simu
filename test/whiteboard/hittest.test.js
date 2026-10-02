import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementAt } from '../../src/whiteboard/hittest.js';
import { expandSpec } from '../../src/whiteboard/expand.js';
import { demoFor } from '../../src/whiteboard/demoReplicationFork.js';

const steps = expandSpec({
  steps: [
    { cue: 'a', elements: [
      { type: 'text', x: 100, y: 60, text: 'Quadratic equation', size: 30 },
      { type: 'math', x: 500, y: 200, tex: String.raw`x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}`, size: 30, align: 'center' },
    ] },
    { cue: 'b', elements: [
      { type: 'circle', cx: 800, cy: 420, r: 40 },
      { type: 'text', x: 800, y: 490, text: 'vertex', align: 'center' },
    ] },
  ],
});

test('a click on a formula returns its LaTeX; on a text, the text', () => {
  assert.deepEqual(elementAt(steps, 1, 500, 200), { kind: 'math', value: String.raw`x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}`, step: 0 });
  assert.deepEqual(elementAt(steps, 1, 150, 62), { kind: 'text', value: 'Quadratic equation', step: 0 });
});

test('a click on a shape names it by the nearest label', () => {
  assert.deepEqual(elementAt(steps, 1, 800, 420), { kind: 'part', value: 'vertex', step: 1 });
});

test('only steps already drawn count; empty board space finds nothing', () => {
  assert.equal(elementAt(steps, 0, 800, 420), null); // the circle comes in step 1
  assert.equal(elementAt(steps, 1, 950, 30), null);
});

test('diagram components: a click on the helicase ring is named by its label, in the lesson language', () => {
  const fr = expandSpec(demoFor('fr').spec);
  const ring = fr[1].primitives.find((p) => p.role === 'helicase');
  const hit = elementAt(fr, fr.length - 1, ring.cx + ring.r, ring.cy);
  assert.deepEqual(hit, { kind: 'part', value: 'hélicase', step: 1 });
});
