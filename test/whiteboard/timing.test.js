import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathLength, parsePath } from '../../src/whiteboard/geometry.js';
import { toDrawOps } from '../../src/whiteboard/primitives.js';
import { expandSpec } from '../../src/whiteboard/expand.js';
import { buildTimeline, createStepPlayer, STROKE_SPEED, MAX_SPEEDUP } from '../../src/whiteboard/timing.js';
import { createNarrator, createEstimatedSource } from '../../src/whiteboard/narration.js';
import { toSVG } from '../../src/whiteboard/svg.js';
import { spec, narration } from '../../src/whiteboard/demoReplicationFork.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('path lengths: lines exact, relative commands, curves approximated', () => {
  assert.equal(pathLength('M 0 0 L 30 40'), 50);
  assert.equal(pathLength('M 10 10 h 20 v 20 h -20 Z'), 80);
  assert.ok(close(pathLength('M 0 0 Q 50 0 100 0'), 100, 1e-3));
  assert.throws(() => parsePath('L 1 2'), /must start with M/);
});

test('stroke duration is proportional to path length', () => {
  const [short] = toDrawOps({ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0 });
  const [long] = toDrawOps({ type: 'line', x1: 0, y1: 0, x2: 800, y2: 0 });
  const t = buildTimeline([short, long]);
  assert.ok(close(t.items[0].end - t.items[0].start, 200 / STROKE_SPEED));
  assert.ok(close((t.items[1].end - t.items[1].start) / (t.items[0].end - t.items[0].start), 4));
});

test('fitDuration speeds a long step up (capped), never slows a short one down', () => {
  const ops = expandSpec(spec)[0].ops;
  const natural = buildTimeline(ops).duration;
  assert.ok(close(buildTimeline(ops, { fitDuration: natural / 2 }).duration, natural / 2));
  assert.ok(close(buildTimeline(ops, { fitDuration: natural / 10 }).duration, natural / MAX_SPEEDUP));
  assert.ok(close(buildTimeline(ops, { fitDuration: natural * 3 }).duration, natural));
});

test('a formula becomes filled glyph outlines with a measured box, timed like text, exported to SVG', () => {
  const [step] = expandSpec({ steps: [{ cue: 'a', elements: [{ type: 'math', x: 500, y: 280, tex: String.raw`E = mc^2`, size: 30, align: 'center' }] }] });
  assert.equal(step.ops.length, 1);
  const [op] = step.ops;
  assert.equal(op.kind, 'glyphs');
  assert.match(op.d, /^M [\d.-]+ [\d.-]+ /);
  assert.ok(Math.abs(op.box.left + op.box.width / 2 - 500) < 0.01, 'centred on x');
  assert.ok(Math.abs(op.box.top + op.box.height / 2 - 280) < 0.01, 'vertical middle on y');
  assert.ok(op.box.width > 80 && op.box.width < 160, `width ${op.box.width}`);
  const t = buildTimeline([op]);
  assert.ok(t.duration > 0.2 && t.duration < 2, `duration ${t.duration}`);
  assert.match(toSVG([op]), /<path d="M [^"]+" fill="#1d1d1f"\/>/);
});

test('the demo expands to drawable ops and exports to SVG', () => {
  const steps = expandSpec(spec);
  assert.equal(steps.length, 7);
  for (const s of steps) assert.ok(s.ops.length > 0 && s.ops.every((op) => op.kind === 'stroke' ? op.length > 0 : op.text));
  const svg = toSVG(steps.flatMap((s) => s.ops));
  assert.match(svg, /^<svg[^>]+viewBox="0 0 1000 560"/);
  assert.equal((svg.match(/>Okazaki fragment</g) ?? []).length, 1);
});

/**
 * Simulates the demo loop in Node: narration (estimated timing) drives the
 * whiteboard; the student interrupts 3 times. Drawing and speech share the
 * same clock, so after the interruptions they must still be aligned.
 */
function simulate({ interruptions }) {
  const steps = expandSpec(spec);
  const player = createStepPlayer();
  const source = createEstimatedSource();
  const narrator = createNarrator({ segments: narration, source, canAdvance: () => player.done });
  const log = [];
  let clock = 0;
  narrator.on('segment:start', ({ index, duration }) => {
    player.start(buildTimeline(steps[index].ops, { fitDuration: duration }));
    log.push({ event: 'start', index, clock, speech: narrator.position, drawing: player.time });
  });
  narrator.on('segment:end', ({ index }) => log.push({ event: 'end', index, clock, drawingDone: player.done }));
  let ended = false;
  narrator.on('end', () => { ended = true; });

  narrator.play();
  const dt = 1 / 60;
  let pausedFor = 0;
  let pending = [...interruptions];
  while (!ended && clock < 600) {
    clock += dt;
    if (pending.length && clock >= pending[0].at && !narrator.paused) {
      narrator.pause(); player.pause(); pausedFor = pending[0].length;
    }
    if (narrator.paused) {
      // Interrupted: neither speech nor drawing moves.
      const before = [narrator.position, player.time];
      narrator.update(dt); player.advance(dt);
      assert.deepEqual([narrator.position, player.time], before);
      pausedFor -= dt;
      if (pausedFor <= 0) { narrator.resume(); player.resume(); pending.shift(); }
      continue;
    }
    narrator.update(dt);
    player.advance(dt);
  }
  return { log, ended, clock };
}

test('the narrator can pick up from a given segment (resuming after a question)', () => {
  const started = [];
  const narrator = createNarrator({ segments: narration, source: createEstimatedSource(), gap: 0 });
  narrator.on('segment:start', ({ index }) => started.push(index));
  let ended = false;
  narrator.on('end', () => { ended = true; });
  narrator.play(4);
  for (let t = 0; t < 120 && !ended; t += 0.1) narrator.update(0.1);
  assert.deepEqual(started, [4, 5, 6]);
});

test('pause/resume keeps drawing and speech aligned (no drift after 3 interruptions)', () => {
  const plain = simulate({ interruptions: [] });
  const paused = simulate({ interruptions: [{ at: 5, length: 2 }, { at: 21.3, length: 4.5 }, { at: 40.7, length: 1 }] });
  assert.ok(plain.ended && paused.ended);
  const starts = (run) => run.log.filter((e) => e.event === 'start');
  // Every step starts exactly when its narration segment starts, with speech and drawing both at 0.
  for (const e of starts(paused)) assert.deepEqual([e.speech, e.drawing], [0, 0]);
  // Every segment ends only once its drawing is complete.
  for (const e of paused.log.filter((x) => x.event === 'end')) assert.equal(e.drawingDone, true, `segment ${e.index} ended before its drawing`);
  // Interruptions shift the whole timeline by exactly their total length (7.5 s), no more, no less.
  starts(paused).forEach((e, i) => {
    const expectedShift = [5, 21.3, 40.7].filter((at, k) => at < e.clock).reduce((s, _, k) => s + [2, 4.5, 1][k], 0);
    assert.ok(Math.abs(e.clock - starts(plain)[i].clock - expectedShift) < 0.05,
      `segment ${i} drifted: ${(e.clock - starts(plain)[i].clock).toFixed(3)} s vs ${expectedShift} s of pauses`);
  });
  assert.ok(Math.abs(paused.clock - plain.clock - 7.5) < 0.05);
});
