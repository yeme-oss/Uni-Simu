import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintLayout } from '../../src/whiteboard/layout.js';
import { expandSpec } from '../../src/whiteboard/expand.js';
import { spec as demoSpec, demoFor } from '../../src/whiteboard/demoReplicationFork.js';

const lint = (steps) => lintLayout(expandSpec({ steps: steps.map((elements, i) => ({ cue: `s${i}`, elements })) }));

test('the hand-made demo has no layout problems (no false positives on components)', () => {
  assert.deepEqual(lintLayout(expandSpec(demoSpec)), []);
});

test('the French demo has no layout problems either (longer labels still fit)', () => {
  assert.deepEqual(lintLayout(expandSpec(demoFor('fr').spec)), []);
});

test('flags overlapping texts, across steps', () => {
  const problems = lint([[{ type: 'text', x: 100, y: 100, text: 'glucose' }], [{ type: 'text', x: 120, y: 105, text: 'pyruvate' }]]);
  assert.deepEqual(problems, ['texts overlap: text "glucose" (steps[0]) and text "pyruvate" (steps[1])']);
});

test('flags text that overflows its circle or rect, and text off the board', () => {
  const problems = lint([[
    { type: 'circle', cx: 300, cy: 200, r: 40 },
    { type: 'text', x: 300, y: 200, text: 'Succinyl-CoA (4C)', align: 'center' },
    { type: 'rect', x: 500, y: 100, w: 80, h: 40 },
    { type: 'text', x: 510, y: 120, text: 'a rather long label' },
    { type: 'text', x: 900, y: 500, text: 'too far right here' },
  ]]);
  assert.equal(problems.length, 3, problems.join('\n'));
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `missing ${re}\n${problems.join('\n')}`);
  has(/"too far right here" goes outside/);
  has(/"Succinyl-CoA \(4C\)" overflows its circle \(needs radius >= \d+/);
  has(/"a rather long label" overflows its rect/);
});

test('formulas use their real measured box: overlaps, board edges and shapes', () => {
  const problems = lint([[
    { type: 'math', tex: String.raw`\frac{-b \pm \sqrt{b^2-4ac}}{2a}`, x: 200, y: 200, size: 30 },
    { type: 'text', x: 230, y: 200, text: 'roots' },
    { type: 'math', tex: String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`, x: 900, y: 450, size: 30 },
    { type: 'circle', cx: 600, cy: 120, r: 30 },
    { type: 'math', tex: String.raw`E = mc^2`, x: 600, y: 120, size: 30, align: 'center' },
  ]]);
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `missing ${re}\n${problems.join('\n')}`);
  has(/texts overlap: formula "\\frac\{-b.*" \(steps\[0\]\) and text "roots"/);
  has(/formula "\\int_0.*" goes outside the 1000x560 board/);
  has(/formula "E = mc\^2" overflows its circle/);
  assert.equal(problems.length, 3, problems.join('\n'));
});

test('flags labels drawn on top of a component\'s own labels', () => {
  const fork = { type: 'replicationFork', x: 60, y: 50, width: 880, height: 470 };
  // Put our own label right where the component writes "leading strand".
  const own = expandSpec({ steps: [{ cue: 'a', elements: [fork] }] })[0].primitives.find((p) => p.text === 'leading strand');
  const problems = lint([[fork, { type: 'text', x: own.x, y: own.y + 4, text: 'Leading strand', align: 'center' }]]);
  assert.ok(problems.some((p) => /component already draws its own labels/.test(p)), problems.join('\n'));
});
