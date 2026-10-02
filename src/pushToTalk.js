// Push-to-talk: hold the button, speak, release. Records the microphone (the browser asks
// for permission the first time) as 16 kHz mono WAV - a format Gemini accepts everywhere,
// unlike Chrome's WebM - and hands the recording over on release.

const TARGET_RATE = 16000;
const MIN_SECONDS = 0.4;  // shorter presses are taps, not questions
const MAX_SECONDS = 30;

/**
 * `button`: the push-to-talk button. Callbacks:
 *   canStart() -> false to ignore a press (e.g. while something is being generated)
 *   onStart()             recording started (pause the lesson here)
 *   onRecorded(wavBlob)   released with a usable recording
 *   onTooShort()          released too soon
 *   onError(kind, error)  'denied' | 'unsupported' | 'failed'
 */
export function createPushToTalk({ button, canStart = () => true, onStart, onRecorded, onTooShort, onError }) {
  let session = null; // { stream, context, source, processor, chunks, startedAt, stopTimer, cancelled }
  let pressed = false;

  async function start() {
    if (session || !canStart()) return;
    if (!navigator.mediaDevices?.getUserMedia) return onError?.('unsupported');
    pressed = true;
    const current = { chunks: [], cancelled: false };
    session = current;
    button.classList.add('recording');
    try {
      current.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      session = null;
      button.classList.remove('recording');
      return onError?.(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'denied' : 'failed', err);
    }
    if (!pressed || current.cancelled) return release(current, false); // let go while the permission prompt was up
    current.context = new AudioContext();
    current.source = current.context.createMediaStreamSource(current.stream);
    // ScriptProcessor: deprecated but available everywhere, and enough for a short question.
    current.processor = current.context.createScriptProcessor(4096, 1, 1);
    current.processor.onaudioprocess = (e) => current.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    current.source.connect(current.processor);
    current.processor.connect(current.context.destination);
    current.startedAt = performance.now();
    current.stopTimer = setTimeout(stop, MAX_SECONDS * 1000);
    onStart?.();
  }

  function stop() {
    pressed = false;
    if (session) release(session, true);
  }

  function release(current, keep) {
    clearTimeout(current.stopTimer);
    current.processor?.disconnect();
    current.source?.disconnect();
    current.stream?.getTracks().forEach((track) => track.stop()); // the browser's "recording" indicator goes off
    const rate = current.context?.sampleRate ?? 48000;
    current.context?.close();
    if (session === current) session = null;
    button.classList.remove('recording');
    if (!keep || !current.startedAt) return;
    const seconds = (performance.now() - current.startedAt) / 1000;
    if (seconds < MIN_SECONDS) return onTooShort?.();
    onRecorded?.(toWav(current.chunks, rate));
  }

  // Mouse / touch / pen: hold to talk. Keyboard: hold Space or Enter on the focused button.
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.setPointerCapture?.(e.pointerId); // keep receiving pointerup even if the finger slides off
    start();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, stop);
  button.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); }
  });
  button.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } });
  button.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press must not open a menu

  return { get recording() { return Boolean(session); } };
}

/** Float32 chunks at `rate` -> 16 kHz mono 16-bit PCM WAV blob. */
function toWav(chunks, rate) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { input.set(c, offset); offset += c.length; }
  // Downsample by averaging each output sample's window (simple low-pass).
  const ratio = rate / TARGET_RATE;
  const out = new Int16Array(Math.floor(length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio), to = Math.min(length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const header = new DataView(new ArrayBuffer(44));
  const write = (pos, text) => { for (let i = 0; i < text.length; i++) header.setUint8(pos + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); header.setUint32(4, 36 + out.byteLength, true); write(8, 'WAVE');
  write(12, 'fmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, TARGET_RATE, true); header.setUint32(28, TARGET_RATE * 2, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  write(36, 'data'); header.setUint32(40, out.byteLength, true);
  return new Blob([header, out], { type: 'audio/wav' });
}
