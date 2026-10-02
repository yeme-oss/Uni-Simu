import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec } from '../src/whiteboard/validate.js';
import { expandSpec } from '../src/whiteboard/expand.js';
import { lintLayout } from '../src/whiteboard/layout.js';
import { chart, connector, dashed, pie, table, flow } from '../src/whiteboard/draw.js';
import { GALLERY } from './fixtures/drawGallery.js';

for (const [name, spec] of Object.entries(GALLERY)) {
  test(`gallery "${name}": every helper gives valid elements with a clean layout`, () => {
    const { errors } = validateSpec(spec, { cues: spec.steps.map((s) => s.cue) });
    assert.deepEqual(errors, []);
    assert.deepEqual(lintLayout(expandSpec(spec)), []);
  });
}

test('chart maps data to the board', () => {
  const c = chart({ x0: 100, y0: 500, w: 400, h: 200, xMin: 0, xMax: 10, yMin: 0, yMax: 100 });
  assert.equal(c.x(0), 100);
  assert.equal(c.x(10), 500);
  assert.equal(c.y(50), 400);
  assert.equal(c.bars([10, 20]).filter((e) => e.type === 'rect').length, 2);
});

test('connector stops at the circles', () => {
  const a = connector([0, 0], [100, 0], { ra: 20, rb: 30 });
  assert.deepEqual([a.x1, a.x2], [20, 70]);
});

test('dashed line is one path of several strokes', () => {
  const d = dashed(0, 0, 100, 0);
  assert.equal(d.type, 'path');
  assert.ok(d.d.split('M').length > 5);
});

test('pie has one slice per part; table and flow have one label per cell / step', () => {
  assert.equal(pie(500, 300, 100, [{ value: 1, color: 'red' }, { value: 3, color: 'blue' }]).filter((e) => e.type === 'path').length, 2);
  assert.equal(table(0, 0, [['a', 'b'], ['c', 'd']]).filter((e) => e.type === 'text').length, 4);
  const steps = flow(['1', '2', '3'], { x: 0, y: 0 });
  assert.equal(steps.filter((e) => e.type === 'arrow').length, 2);
});
