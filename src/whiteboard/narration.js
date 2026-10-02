// Narration sequencer: plays segments { id, text } one after another and emits
// 'segment:start' / 'segment:end' / 'end'. Timing comes from a swappable
// source (real audio clock, or an estimate from text length). Pure: no DOM.

export const ESTIMATED_WORDS_PER_SECOND = 2.3;

/** Minimal event emitter. */
export function createEmitter() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    emit(event, payload) { handlers.get(event)?.forEach((fn) => fn(payload)); },
  };
}

/**
 * Timing source that estimates each segment's duration from its text and
 * advances with the render loop's dt. Swap for an audio-clock source with
 * the same shape: begin(segment) -> duration, tick(dt), position, pause(), resume(), stop().
 */
export function createEstimatedSource({ wordsPerSecond = ESTIMATED_WORDS_PER_SECOND } = {}) {
  let position = 0;
  let paused = false;
  return {
    begin(segment) {
      position = 0;
      return segment.text.trim().split(/\s+/).length / wordsPerSecond;
    },
    tick(dt) { if (!paused) position += dt; },
    get position() { return position; },
    pause() { paused = true; },
    resume() { paused = false; },
    stop() { position = 0; },
  };
}

/**
 * Sequences segments. A segment ends when the source reports its duration has
 * elapsed AND `canAdvance()` agrees (e.g. the whiteboard finished the matching
 * step), so speech and drawing can't drift apart. `gap` = pause between segments.
 */
export function createNarrator({ segments, source, canAdvance = () => true, gap = 0.35 }) {
  const events = createEmitter();
  let index = -1;
  let state = 'idle';   // 'idle' | 'speaking' | 'holding' | 'gap' | 'done'
  let duration = 0;
  let gapLeft = 0;
  let paused = false;

  function startSegment(i) {
    index = i;
    const segment = segments[i];
    duration = source.begin(segment);
    state = 'speaking';
    events.emit('segment:start', { index: i, segment, duration });
  }

  return {
    on: events.on,
    get state() { return state; },
    get index() { return index; },
    get paused() { return paused; },
    get position() { return source.position; },
    get duration() { return duration; },

    /** Starts at segment `from` (0 = the beginning), e.g. to pick up after an interruption. */
    play(from = 0) {
      paused = false;
      if (from < segments.length) startSegment(Math.max(0, from));
      else state = 'done';
    },
    pause() { if (!paused) { paused = true; source.pause(); } },
    resume() { if (paused) { paused = false; source.resume(); } },
    stop() {
      source.stop();
      state = 'idle';
      index = -1;
      paused = false;
    },
    update(dt) {
      if (paused || state === 'idle' || state === 'done') return;
      if (state === 'gap') {
        gapLeft -= dt;
        if (gapLeft <= 0) startSegment(index + 1);
        return;
      }
      source.tick?.(dt);
      if (state === 'speaking' && source.position >= duration) state = 'holding';
      if (state === 'holding' && canAdvance()) {
        events.emit('segment:end', { index, segment: segments[index] });
        if (index + 1 < segments.length) {
          state = 'gap';
          gapLeft = gap;
        } else {
          state = 'done';
          events.emit('end');
        }
      }
    },
  };
}
