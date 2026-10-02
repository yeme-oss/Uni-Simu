// Minimal Gemini REST client (structured JSON output). The API key stays on the server.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// Model levels: Flash-Lite is the default and the only one this server uses unless
// ALLOW_MODEL_SELECTION=true (the GitHub FOSS release, where you bring your own key).
// GEMINI_TEXT_MODEL / GEMINI_TTS_MODEL override the default level's models.
export const MODEL_TIERS = {
  lite: {
    label: 'Flash-Lite',
    text: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite',
    tts: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts',
  },
  flash: { label: 'Flash (smarter)', text: 'gemini-3.8-flash', tts: 'gemini-3.8-flash-tts' },
  pro: { label: 'Pro (smartest, slow)', text: 'gemini-3.1-pro-preview', tts: 'gemini-3.8-flash-tts' },
};
export const DEFAULT_TIER = 'lite';
export const MODEL_SELECTION = process.env.ALLOW_MODEL_SELECTION === 'true';

/** The model level a request may use: its choice only when selection is unlocked, else the default. */
export const resolveTier = (tier) => MODEL_TIERS[MODEL_SELECTION && tier in MODEL_TIERS ? tier : DEFAULT_TIER];

export const TEXT_MODEL = MODEL_TIERS[DEFAULT_TIER].text;

/**
 * Every call takes an optional `meter` (pricing.js createMeter) that records its token usage.
 *
 * JSON output. With `schema` the response is constrained to it; without, the
 * model is only asked for JSON (for schemas Gemini can't enforce — validate after).
 */
export async function generateJSON({ system, prompt, schema, model = TEXT_MODEL, thinkingLevel = 'low', meter }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(schema && { responseJsonSchema: schema }),
        thinkingConfig: { thinkingLevel },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'request failed'}`);
  meter?.add(model, body.usageMetadata); // tokens -> cost (see pricing.js)

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  if (!text) throw new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
  return JSON.parse(text);
}

export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

/** Generates one image; resolves to { mimeType, data: Buffer }. */
export async function generateImage({ prompt, aspectRatio = '16:9', imageSize = '1K', model = IMAGE_MODEL, meter }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio, imageSize } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'request failed'}`);
  meter?.add(model, body.usageMetadata); // tokens -> cost (see pricing.js)

  const candidate = body.candidates?.[0];
  const image = candidate?.content?.parts?.find((p) => p.inlineData && !p.thought)?.inlineData;
  if (!image) throw new Error(`Gemini returned no image (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
  return { mimeType: image.mimeType, data: Buffer.from(image.data, 'base64') };
}

export const TTS_MODEL = MODEL_TIERS[DEFAULT_TIER].tts;
export const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Charon'; // male, informative
export const TTS_VOICE_FEMALE = process.env.GEMINI_TTS_VOICE_FEMALE || 'Kore'; // female, firm
/** Prebuilt voice per teacher model. */
export const TTS_VOICES = { male: TTS_VOICE, female: TTS_VOICE_FEMALE };

/**
 * Text-to-speech; resolves to { mimeType, data: Buffer } (WAV, 24 kHz mono).
 * Send only the words to speak: this model rejects system instructions, and
 * style directions put in the prompt are sometimes read out loud.
 */
export async function generateSpeechAudio({ text, voice = TTS_VOICE, model = TTS_MODEL, meter }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'request failed'}`);
  meter?.add(model, body.usageMetadata); // tokens -> cost (see pricing.js)

  const candidate = body.candidates?.[0];
  const audio = candidate?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!audio) throw new Error(`Gemini returned no audio (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
  const data = Buffer.from(audio.data, 'base64');
  // Raw PCM (audio/L16) needs a WAV header for the browser to decode it.
  if (data.subarray(0, 4).toString() === 'RIFF') return { mimeType: 'audio/wav', data };
  const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1]) || 24000;
  return { mimeType: 'audio/wav', data: Buffer.concat([wavHeader(data.length, rate), data]) };
}

function wavHeader(dataBytes, sampleRate, channels = 1, bits = 16) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataBytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(dataBytes, 40);
  return h;
}

/**
 * Speech to text: what the student said in a short recording (e.g. a WAV from push-to-talk).
 * `language` (e.g. 'French') helps with accents and terms. Returns the transcript ('' if
 * nothing intelligible was said).
 */
export async function transcribeAudio({ data, mimeType = 'audio/wav', language = '', model = TEXT_MODEL, meter }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(data).toString('base64') } },
          { text: `This is a student asking their teacher a question${language ? ` (most likely in ${language})` : ''}. Transcribe exactly what they say, with correct spelling and punctuation. Only the spoken words, no commentary. If nothing intelligible is said, return an empty transcript.` },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', properties: { transcript: { type: 'string' } }, required: ['transcript'] },
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.error?.message ?? 'request failed'}`);
  meter?.add(model, body.usageMetadata);
  const text = body.candidates?.[0]?.content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  return String(JSON.parse(text || '{}').transcript ?? '').trim().slice(0, 500);
}
