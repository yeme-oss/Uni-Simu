// Plays the lecturer's voice clips through Web Audio. Pausing suspends the
// AudioContext, which also freezes `position`, so subtitles stay in sync.

const VOICE_THRESHOLD = 0.02; // RMS level above which the voice counts as "talking"
const VOICE_HOLD = 0.25;      // seconds of silence before he's considered paused

export function createVoicePlayer() {
  const ctx = new AudioContext();
  const analyser = Object.assign(ctx.createAnalyser(), { fftSize: 1024 });
  analyser.connect(ctx.destination);
  const samples = new Float32Array(analyser.fftSize);

  let source = null;
  let startedAt = 0;
  let silentFor = Infinity;

  return {
    /** Must be called from a user gesture (e.g. the Play click) so audio may start. */
    unlock: () => ctx.resume(),
    pause: () => ctx.suspend(),
    resume: () => ctx.resume(),
    decode: (arrayBuffer) => ctx.decodeAudioData(arrayBuffer),

    play(buffer) {
      this.stop();
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      source.start();
      startedAt = ctx.currentTime;
    },
    stop() {
      source?.stop();
      source?.disconnect();
      source = null;
      silentFor = Infinity;
    },
    /** Seconds into the current clip. */
    get position() {
      return source ? ctx.currentTime - startedAt : 0;
    },
    /** Whether the voice is audible right now (with a short hold to bridge gaps between words). */
    isVoiceActive(dt) {
      if (!source) return false;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      silentFor = Math.sqrt(sum / samples.length) > VOICE_THRESHOLD ? 0 : silentFor + dt;
      return silentFor < VOICE_HOLD;
    },
  };
}
