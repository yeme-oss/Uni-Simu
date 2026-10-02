// Draws expanded diagram steps onto a 2D canvas, stroke by stroke.
// Strokes are revealed with a growing line dash, text with a left-to-right clip.
// Driven by the render loop: update(dt) returns true only when pixels changed,
// so the caller uploads the texture only then.
import { buildTimeline, createStepPlayer } from './timing.js';
import { BOARD_WIDTH, FONT_FAMILY } from './constants.js';

export const BOARD_BACKGROUND = '#f4f4f0';

/**
 * @param canvas   target canvas (its size sets the resolution; logical units are scaled to fit)
 * @param jitter   optional hand-drawn wobble in logical units (0 = off)
 */
export function createAnimator({ canvas, jitter = 0 }) {
  const ctx = canvas.getContext('2d');
  // Finished strokes live on a second canvas; each animated frame = base + strokes in progress.
  const base = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  const baseCtx = base.getContext('2d');
  const scale = canvas.width / BOARD_WIDTH;
  const player = createStepPlayer();
  const paths = new WeakMap();   // op -> Path2D
  const wobble = new WeakMap();  // op -> [dx, dy, angle]

  let steps = [];
  let stepIndex = -1;
  let autoPlay = false;          // play(): chain all steps without narration
  let inProgress = new Map();    // timeline item -> progress
  let dirty = false;

  const pathOf = (op) => {
    if (!paths.has(op)) paths.set(op, new Path2D(op.d));
    return paths.get(op);
  };

  function withTransform(c, op, draw) {
    c.save();
    c.setTransform(scale, 0, 0, scale, 0, 0);
    if (jitter > 0) {
      if (!wobble.has(op)) wobble.set(op, [(Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter * 0.002]);
      const [dx, dy, a] = wobble.get(op);
      c.translate(dx, dy);
      c.rotate(a);
    }
    draw();
    c.restore();
  }

  function drawOp(c, op, progress) {
    withTransform(c, op, () => {
      if (op.kind === 'text') {
        c.font = `${op.size}px "${FONT_FAMILY}", sans-serif`;
        c.fillStyle = op.color;
        c.textAlign = op.align;
        c.textBaseline = 'middle';
        if (progress < 1) {
          const w = c.measureText(op.text).width;
          const left = op.align === 'center' ? op.x - w / 2 : op.align === 'right' ? op.x - w : op.x;
          c.beginPath();
          c.rect(left - 2, op.y - op.size, (w + 4) * progress, op.size * 2);
          c.clip();
        }
        c.fillText(op.text, op.x, op.y);
        return;
      }
      if (op.kind === 'glyphs') { // a formula: filled outlines, revealed left to right like text
        const { left, top, width, height } = op.box;
        if (progress < 1) {
          c.beginPath();
          c.rect(left - 2, top - 2, (width + 4) * progress, height + 4);
          c.clip();
        }
        c.fillStyle = op.color;
        c.fill(pathOf(op));
        return;
      }
      const path = pathOf(op);
      c.strokeStyle = op.color;
      c.lineWidth = op.width;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (progress < 1) c.setLineDash([op.length * progress, op.length + 1]);
      c.stroke(path);
      if (progress >= 1 && op.fill) {
        c.fillStyle = op.fill;
        c.fill(path);
      }
    });
  }

  function commit(op) {
    drawOp(baseCtx, op, 1);
  }

  function compose() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    for (const [item, progress] of inProgress) drawOp(ctx, item.op, progress);
    dirty = true;
  }

  function startStep(n, options) {
    stepIndex = n;
    inProgress = new Map();
    player.start(buildTimeline(steps[n].ops, options));
  }

  const api = {
    /** Loads expanded steps (see expandSpec) and clears the board. */
    load(expandedSteps) {
      steps = expandedSteps;
      api.clear();
    },
    clear() {
      player.stop();
      autoPlay = false;
      stepIndex = -1;
      inProgress = new Map();
      baseCtx.setTransform(1, 0, 0, 1, 0, 0);
      baseCtx.fillStyle = BOARD_BACKGROUND;
      baseCtx.fillRect(0, 0, base.width, base.height);
      compose();
    },
    /** Starts animating step n (earlier steps are completed first). `fitDuration` = narration length. */
    drawStep(n, { fitDuration } = {}) {
      api.completeStep();
      for (let k = stepIndex + 1; k < n; k++) steps[k].ops.forEach(commit); // skipped steps
      startStep(n, { fitDuration });
    },
    /** Finishes the current step instantly. */
    completeStep() {
      if (stepIndex < 0 || player.done) return;
      for (const { item } of player.finish()) inProgress.set(item, 1);
      for (const item of inProgress.keys()) commit(item.op);
      inProgress = new Map();
      compose();
    },
    /** Draws everything that's left, instantly. */
    skipToEnd() {
      autoPlay = false;
      api.completeStep();
      for (let k = stepIndex + 1; k < steps.length; k++) steps[k].ops.forEach(commit);
      stepIndex = steps.length - 1;
      compose();
    },
    /** Standalone playback: draws all steps one after another (no narration). */
    play() {
      api.clear();
      autoPlay = true;
      if (steps.length) startStep(0);
    },
    pause: () => player.pause(),
    resume: () => player.resume(),
    get paused() { return player.paused; },
    get stepIndex() { return stepIndex; },
    get stepDone() { return player.done; },
    get time() { return player.time; },

    /** Advances the animation; returns true if the canvas changed this frame. */
    update(dt) {
      const changed = player.advance(dt);
      for (const { item, progress } of changed) {
        if (progress >= 1) {
          commit(item.op);
          inProgress.delete(item);
        } else {
          inProgress.set(item, progress);
        }
      }
      if (changed.length) compose();
      if (autoPlay && player.done && stepIndex + 1 < steps.length) startStep(stepIndex + 1);
      const wasDirty = dirty;
      dirty = false;
      return wasDirty;
    },
  };
  return api;
}

