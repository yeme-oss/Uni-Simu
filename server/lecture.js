import { generateJSON, generateImage, generateSpeechAudio, TTS_VOICES } from './gemini.js';

const MINUTES_PER_SLIDE = 2;      // "minutes" mode: deck size estimate
const SPOKEN_WORDS_PER_MINUTE = 130;
const WORDS_PER_SLIDE = 150;      // "slides" mode: ~1 min of speech per slide
const MAX_SLIDES = 60;

export const AUDIENCE = {
  eli5: 'adults who want the simplest possible explanation ("explain like I\'m 5" is a figure of speech: do not address a child or be childish or patronizing). Use short sentences, plain everyday words and one concrete familiar analogy. Avoid jargon and math; if a technical term is unavoidable, introduce it in plain words.',
  beginner: 'complete beginners with no prior knowledge. Use everyday language, analogies and define every term.',
  undergraduate: 'undergraduate university students. Assume high-school background; introduce technical terms with brief definitions.',
  graduate: 'graduate students. Assume solid undergraduate knowledge; be rigorous and precise, cover nuances and current methods.',
  expert: 'researchers and experts. Go deep: open problems, recent results, subtle trade-offs. Skip basics.',
};

const LECTURER = `You are an engaging university lecturer giving a live lecture in a classroom, standing at a lectern next to a slideshow.`;

export function parseSettings(body) {
  const subject = String(body?.subject ?? '').trim().slice(0, 500);
  if (!subject) throw badRequest('subject is required');
  const difficulty = body.difficulty in AUDIENCE ? body.difficulty : 'undergraduate';
  const length = Math.max(1, Math.min(120, Math.round(Number(body.length) || 1)));
  const lengthUnit = body.lengthUnit === 'minutes' ? 'minutes' : 'slides';

  const slideCount = lengthUnit === 'slides'
    ? Math.min(MAX_SLIDES, length)
    : Math.max(1, Math.min(MAX_SLIDES, Math.round(length / MINUTES_PER_SLIDE)));
  const wordsPerSlide = lengthUnit === 'slides'
    ? WORDS_PER_SLIDE
    : Math.round((length * SPOKEN_WORDS_PER_MINUTE) / slideCount);
  return { subject, difficulty, slideCount, wordsPerSlide };
}

/** Lecture title + one entry (title, key points) per slide. */
export async function generateOutline({ subject, difficulty, slideCount, wordsPerSlide }) {
  const outline = await generateJSON({
    system: `${LECTURER} You are preparing the slide deck for a lecture aimed at ${AUDIENCE[difficulty]}`,
    prompt: `Plan a lecture on: "${subject}".
It must have exactly ${slideCount} slide${slideCount > 1 ? 's' : ''}. Build the material up logically, one idea per slide.
${slideCount > 2 ? 'The first slide introduces the topic and the last slide summarises it.' : ''}
For each slide give a short title and 2-5 concise key points (what the slide shows).`,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Lecture title' },
        slides: {
          type: 'array',
          minItems: slideCount,
          maxItems: slideCount,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              points: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'points'],
          },
        },
      },
      required: ['title', 'slides'],
    },
  });
  outline.slides = outline.slides.slice(0, slideCount);
  return { ...outline, wordsPerSlide };
}

/** What the lecturer says while one slide is shown. */
export async function generateSpeech({ subject, difficulty, outline, index, wordsPerSlide }) {
  const slides = outline?.slides;
  if (!Array.isArray(slides) || !(index >= 0 && index < slides.length)) throw badRequest('bad outline or index');
  const n = slides.length;
  const deck = slides
    .map((s, i) => `${i + 1}. ${s.title}${i === index ? '  <-- CURRENT SLIDE' : ''}\n   - ${s.points.join('\n   - ')}`)
    .join('\n');
  const position = n === 1 ? 'This is the only slide: open the lecture, teach it, and close.'
    : index === 0 ? 'This is the first slide: briefly greet the class and introduce the lecture.'
    : index === n - 1 ? 'This is the last slide: wrap up the lecture and thank the class. Do not greet again.'
    : 'This is a middle slide: continue naturally from the previous one. Do not greet or re-introduce the lecture.';

  const { speech } = await generateJSON({
    system: `${LECTURER} Your audience: ${AUDIENCE[difficulty]}
You write exactly what you say out loud. It will be shown as subtitles and later read by a text-to-speech voice, so:
- plain spoken sentences only: no markdown, lists, headings, emojis or stage directions;
- write numbers, symbols and formulas the way you would say them;
- refer to the slide naturally ("as you can see here…") and explain its points, don't just read them.`,
    prompt: `Lecture: "${outline.title}" (topic: "${subject}")

Slide deck:
${deck}

Write your speech for slide ${index + 1} of ${n}, "${slides[index].title}". ${position}
Length: about ${wordsPerSlide} words.`,
    schema: {
      type: 'object',
      properties: { speech: { type: 'string' } },
      required: ['speech'],
    },
  });
  return { speech: speech.trim() };
}

// Same visual brief for every slide so the deck looks consistent.
const SLIDE_STYLE = `Style: clean, modern academic presentation. Plain white background, dark navy
sans-serif title at the top left, the key points as short bullets on the left half, and one clear,
accurate, labelled diagram or illustration on the right half that explains the slide's idea.
Large, highly legible text. No slide numbers, footers, logos, watermarks or decorative clutter.`;

/** The slide image shown on the whiteboard for one slide of the outline. */
export async function generateSlideImage({ difficulty, outline, index }) {
  const slide = outline?.slides?.[index];
  if (!slide) throw badRequest('bad outline or index');
  const n = outline.slides.length;

  return generateImage({
    prompt: `Create slide ${index + 1} of ${n} of a university lecture titled "${outline.title}",
aimed at ${AUDIENCE[difficulty]}

Slide title: "${slide.title}"
Bullet points (use this text exactly, spelled correctly):
${slide.points.map((p) => `- ${p}`).join('\n')}

${SLIDE_STYLE}`,
  });
}

const MAX_VOICE_CHARS = 2000;

/** Voice for one chunk of the lecturer's speech (WAV). `teacher`: 'female' or anything else (male). */
export async function generateVoice(text, teacher, model, meter) {
  text = String(text ?? '').trim();
  if (!text) throw badRequest('text is required');
  if (text.length > MAX_VOICE_CHARS) throw badRequest(`text is longer than ${MAX_VOICE_CHARS} characters`);
  return generateSpeechAudio({ text, voice: TTS_VOICES[teacher === 'female' ? 'female' : 'male'], model, meter });
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}
