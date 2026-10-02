import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, assertValidSpec } from '../../src/whiteboard/validate.js';
import { spec as demoSpec, narration, demoFor } from '../../src/whiteboard/demoReplicationFork.js';
import { expandSpec } from '../../src/whiteboard/expand.js';

const cues = narration.map((s) => s.id);
const step = (elements, cue = 'intro') => ({ cue, elements });

test('the demo spec is valid and every step cue matches a narration segment', () => {
  const result = validateSpec(demoSpec, { cues });
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.equal(demoSpec.steps.length, narration.length);
});

test('the French demo is valid, fully translated, and its fork draws French labels', () => {
  const fr = demoFor('fr');
  assert.deepEqual(validateSpec(fr.spec, { cues: fr.narration.map((s) => s.id) }), { valid: true, errors: [] });
  assert.deepEqual(fr.narration.map((s) => s.id), cues);
  assert.ok(fr.narration.every((s, i) => s.text && s.text !== narration[i].text));
  const words = expandSpec(fr.spec).flatMap((s) => s.primitives).filter((p) => p.role === 'label').map((p) => p.text);
  for (const w of ['hélicase', 'topoisomérase', 'brin précoce', 'brin tardif', "amorce d'ARN", "fragment d'Okazaki", 'la fourche avance']) {
    assert.ok(words.includes(w), `missing French label "${w}"`);
  }
  assert.ok(!words.includes('helicase') && !words.includes('leading strand'));
  assert.equal(demoFor('xx'), demoFor('en')); // unknown language falls back to English
});

test('rejects an unknown element type with a readable message', () => {
  const { valid, errors } = validateSpec({ steps: [step([{ type: 'hexagon', x: 1, y: 2 }])] });
  assert.equal(valid, false);
  assert.match(errors[0], /^steps\[0\]\.elements\[0\]: unknown element type "hexagon" \(expected one of: line, arrow, .*replicationFork\)$/);
});

test('rejects a step without a cue', () => {
  const { valid, errors } = validateSpec({ steps: [{ elements: [{ type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }] }] });
  assert.equal(valid, false);
  assert.deepEqual(errors, ['steps[0]: missing required property "cue"']);
});

test('rejects a cue that matches no narration segment, and duplicate cues', () => {
  const line = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
  const { errors } = validateSpec({ steps: [step([line], 'duplex'), step([line], 'duplex'), step([line], 'nope')] }, { cues });
  assert.deepEqual(errors, [
    'steps[1].cue: duplicate cue "duplex"',
    'steps[2].cue: "nope" matches no narration segment',
  ]);
});

test('reports missing and unknown properties on the right element', () => {
  const { errors } = validateSpec({ steps: [step([{ type: 'circle', cx: 5, cy: 5, radius: 3 }])] });
  assert.ok(errors.includes('steps[0].elements[0]: missing required property "r"'), errors.join('\n'));
  assert.ok(errors.includes('steps[0].elements[0]: unknown property "radius"'), errors.join('\n'));
});

test('rejects invalid DNA sequences and unsupported path commands', () => {
  const bad = validateSpec({ steps: [step([{ type: 'dnaStrandPair', sequence: 'AUGC', x: 0, y: 0, length: 100 }])] });
  assert.match(bad.errors[0], /^steps\[0\]\.elements\[0\]\.sequence: must match pattern/);
  const arc = validateSpec({ steps: [step([{ type: 'path', d: 'M 0 0 A 10 10 0 0 1 20 20' }])] });
  assert.deepEqual(arc.errors, ['steps[0].elements[0].d: unsupported path command "A" (use M L H V C S Q T Z)']);
});

test('formulas: valid LaTeX passes, errors and unsupported commands are reported readably', () => {
  const math = (tex) => ({ type: 'math', x: 500, y: 280, tex, size: 30 });
  assert.deepEqual(validateSpec({ steps: [step([math(String.raw`\frac{-b \pm \sqrt{b^2-4ac}}{2a}`), math(String.raw`\mathbb{R}^n`)])] }).errors, []);
  const { errors } = validateSpec({ steps: [step([math(String.raw`\frac{1}{2`), math(String.raw`\ce{H2O}`)])] });
  assert.deepEqual(errors, [
    'steps[0].elements[0].tex: LaTeX error: Missing close brace',
    'steps[0].elements[1].tex: LaTeX error: Undefined control sequence \\ce',
  ]);
});

test('assertValidSpec throws with every message', () => {
  assert.throws(() => assertValidSpec({ steps: [] }), /Invalid whiteboard spec:\n- steps: must NOT have fewer than 1 items/);
});
