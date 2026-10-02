// Drawing timeline: when each draw operation starts and ends within a step.
// Duration follows stroke length / text length, like a hand drawing. Pure.

export const STROKE_SPEED = 520;   // logical units per second
export const TEXT_SPEED = 16;      // characters per second
export const MIN_STROKE_TIME = 0.12;
export const MIN_TEXT_TIME = 0.2;
export const PEN_LIFT = 0.06;      // pause between two operations
export const MAX_SPEEDUP = 2.5;    // how much a step may be sped up to fit its narration

export const opDuration = (op) => {
  if (op.kind === 'text') return Math.max(MIN_TEXT_TIME, op.text.length / TEXT_SPEED);
  // A formula is written like text: as many "characters" as fit its width.
  if (op.kind === 'glyphs') return Math.max(MIN_TEXT_TIME, op.box.width / (op.size * 0.5) / TEXT_SPEED);
  return Math.max(MIN_STROKE_TIME, op.length / STROKE_SPEED);
};

/**
 * Lays out ops one after another. With `fitDuration`, a step that would take
 * longer than its narration is sped up (up to MAX_SPEEDUP); it's never slowed down.
 * Returns { items: [{ op, start, end }], duration, speed }.
 */
export function buildTimeline(ops, { fitDuration } = {}) {
  const natural = ops.reduce((t, op, i) => t + opDuration(op) + (i ? PEN_LIFT : 0), 0);
  const speed = fitDuration > 0 ? Math.min(MAX_SPEEDUP, Math.max(1, natural / fitDuration)) : 1;
  let t = 0;
  const items = ops.map((op, i) => {
    if (i) t += PEN_LIFT / speed;
    const start = t;
    t += opDuration(op) / speed;
    return { op, start, end: t };
  });
  return { items, duration: t, speed };
}

/** Progress (0..1) of a timeline item at time t. */
export const progressAt = (item, t) => (t <= item.start ? 0 : t >= item.end ? 1 : (t - item.start) / (item.end - item.start));

/**
 * Plays a timeline over time. advance(dt) returns the items whose progress
 * changed this tick (with their new progress); nothing when idle or paused.
 */
export function createStepPlayer() {
  let timeline = null;
  let t = 0;
  let paused = false;
  let lastDrawn = new Map(); // item -> progress already drawn

  return {
    start(newTimeline) {
      timeline = newTimeline;
      t = 0;
      lastDrawn = new Map();
    },
    stop() { timeline = null; },
    pause() { paused = true; },
    resume() { paused = false; },
    get paused() { return paused; },
    get time() { return t; },
    get active() { return Boolean(timeline) && t < timeline.duration; },
    get done() { return !timeline || t >= timeline.duration; },
    /** Jumps to the end of the current step. */
    finish() { if (timeline) t = timeline.duration; return this.collect(); },
    advance(dt) {
      if (!timeline || paused || this.done) return [];
      t = Math.min(timeline.duration, t + dt);
      return this.collect();
    },
    collect() {
      if (!timeline) return [];
      const changed = [];
      for (const item of timeline.items) {
        if (item.start > t) break;
        const p = progressAt(item, t);
        if (p !== (lastDrawn.get(item) ?? 0)) {
          lastDrawn.set(item, p);
          changed.push({ item, progress: p });
        }
      }
      return changed;
    },
  };
}
