// Subtitles: split a speech into caption-sized pieces and time them over a clip. Pure.

export const splitSentences = (text) =>
  text.match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

const MAX_CAPTION_WORDS = 16;

/** Splits a speech into subtitle-sized captions (sentences, long ones broken at commas / word count). */
export function toCaptions(speech) {
  const sentences = splitSentences(speech);
  const captions = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    if (words.length <= MAX_CAPTION_WORDS) {
      captions.push({ text: sentence, endsSentence: true });
      continue;
    }
    // Break long sentences into roughly equal chunks, preferring to cut after a comma.
    const parts = Math.ceil(words.length / MAX_CAPTION_WORDS);
    const target = Math.ceil(words.length / parts);
    let chunk = [];
    words.forEach((word, i) => {
      chunk.push(word);
      const last = i === words.length - 1;
      const longEnough = chunk.length >= target || (chunk.length >= target * 0.6 && /[,;:]$/.test(word));
      if (last || (longEnough && words.length - i > 3)) {
        captions.push({ text: chunk.join(' '), endsSentence: last });
        chunk = [];
      }
    });
  }
  return captions;
}

/** Spreads captions over `duration` seconds, proportionally to their length. */
export function timeCaptions(captions, duration) {
  const weights = captions.map((c) => c.text.length + (c.endsSentence ? 12 : 4));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return captions.map((c, i) => {
    const start = (t / total) * duration;
    t += weights[i];
    return { text: c.text, start };
  });
}
