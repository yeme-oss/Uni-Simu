// On-the-fly whiteboard lessons: the LLM writes narrated diagram steps, which are
// validated against the whiteboard schema and linted for layout defects; problems
// are sent back to the LLM for repair.
import { generateJSON } from './gemini.js';
import { AUDIENCE } from './lecture.js';
import { validateSpec } from '../src/whiteboard/validate.js';
import { expandSpec } from '../src/whiteboard/expand.js';
import { lintLayout } from '../src/whiteboard/layout.js';
import { COURSEWORK_RULES } from './coursework.js';
import schema from '../src/whiteboard/schema.json' with { type: 'json' };

const WORDS_PER_SECOND = 2.2;     // Gemini TTS lecture pace
const SECONDS_PER_STEP = 5;
const MAX_REPAIRS = 2;

// Output language of lessons and suggestions (the interface language picked by the student).
const LANGUAGES = { en: 'English', fr: 'French' };
const normLang = (lang) => (Object.hasOwn(LANGUAGES, lang) ? lang : 'en');
const languageRule = (lang) => (lang === 'fr'
  ? 'Language: write the title, every "say" and every text drawn on the board in French - natural French with correct accents, numbers and symbols written the way a French lecturer says them.'
  : 'Language: write the title, every "say" and every text drawn on the board in English.');

const SYSTEM = `You are a university lecturer who explains things by drawing precise diagrams on a whiteboard while talking.
You output JSON only. Your diagrams are built from drawing elements defined by this JSON Schema (element definitions only matter; you don't write the "cue" fields):

${JSON.stringify(schema.definitions, null, 1)}

Teaching style - enlighten, don't obfuscate:
- Think visually first: every lesson is built around at least one real picture of the idea, and almost every step draws something (a shape, a curve, an arrow, a part of the diagram), not only words or symbols.
- Pick the visual that makes the idea click, and vary them across lessons:
  - graphs of functions and data: axes with arrows, a few ticks and labels, curves drawn as paths (C/Q commands for smooth curves), key points marked and annotated;
  - bar charts and histograms (rects on an axis), comparisons side by side, before/after;
  - pie-like proportions (a circle split by lines from its centre), number lines, scales, timelines;
  - flowcharts, cycles and cause-and-effect chains (boxes and arrows), trees and hierarchies, networks;
  - labelled schematics and cross-sections of the real object (a cell, an engine, a circuit, a wave, forces on a body, vectors), small tables drawn as grids.
- Formulas support the picture, they don't replace it: use them sparingly (typically 1 to 3 in a whole lesson, a few more only when the subject is itself mathematical) and only the ones that matter. Each formula appears next to the drawing it describes, with its symbols pointed to or labelled on the drawing, and the speech says what it means in plain words.
- Never fill a step, or the board, with a list of formulas or a list of bullet points. Prefer one clear drawing plus a short label over several lines of text.

Board and layout rules:
- The board is 1000 wide x 560 high, x to the right, y DOWN. Keep everything inside x 30..970, y 30..530.
- Text x/y is the anchor (per align) at the vertical middle of the text. Text width is about 0.45 x size per character, height about size. Texts must never overlap each other; a text placed inside a circle or rect must fit inside it (size the shape from the text).
- Sizes: titles 32-36, labels 22-26, small annotations 20. Stroke width 3 (4 for emphasis).
- Colours: black for structure, blue for the main process, red for key points or warnings, green/orange/purple for distinct parts. Be consistent.
- Plan the whole final layout first, then reveal it step by step; later steps add to earlier ones (nothing is erased). Connect arrows to the shapes they link (end on the shape's edge).
- Be scientifically exact: correct labels, units, arrow directions, proportions.
- Paths: only M L H V C S Q T Z commands (no arcs; use "circle" for round shapes).
- For DNA, always use the dnaStrandPair / replicationFork components (never draw bases by hand): they compute pairing and polarity, and draw their own labels (5′/3′, strand and protein names) - do not add labels on or next to them. replicationFork's "parts" lets you reveal it over several steps; repeat the same geometry each time.
- Arrows are lines with a head at (x2, y2).
- Formulas (when you do use one, see the teaching style above): write every equation, fraction, root, power, index, integral, sum, vector, matrix, Greek letter and unit expression as a "math" element with LaTeX in "tex" (amsmath, no $ delimiters), e.g. {"type":"math","x":500,"y":300,"tex":"\\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}","size":30,"align":"center"}. Use \\\\text{...} for words inside a formula and \\\\mathrm{...} for units and chemical formulas (\\\\mathrm{H_2O}, \\\\mathrm{CO_2}). A formula's height depends on its content (a fraction is about 2.3 x size tall): leave room. Do not write formulas in "text" elements.
- Text elements are for words: Latin-1 characters plus ′ (prime), œ, ’ and « », no emoji, no Greek letters (put those in a "math" element). Always keep accents and apostrophes (French: é, è, à, ç, l'atome, « … »): they display fine, in text elements and in \\\\text{...}.`;

/**
 * Asks the model for a lesson, validates and lints it, repairs it if needed.
 * `context` (optional) is prepended to the task, e.g. the lesson a question interrupted.
 * `coursework` (optional) is the digest of past lessons the teacher may refer back to.
 */
export async function generateWhiteboardLesson({
  subject, length, lengthUnit = 'seconds', difficulty = 'undergraduate',
  thinkingLevel = process.env.WHITEBOARD_THINKING || 'medium', context = '', coursework = '', model, lang = 'en', meter,
}) {
  lang = normLang(lang);
  subject = String(subject ?? '').trim().slice(0, 300);
  if (!subject) throw Object.assign(new Error('subject is required'), { status: 400 });
  if (!(difficulty in AUDIENCE)) difficulty = 'undergraduate';
  // Length: seconds of speech, or a number of steps (~SECONDS_PER_STEP each).
  let steps, duration;
  if (lengthUnit === 'steps') {
    steps = Math.max(1, Math.min(12, Math.round(Number(length) || 4)));
    duration = steps * SECONDS_PER_STEP;
  } else {
    duration = Math.max(5, Math.min(300, Math.round(Number(length) || 20))); // up to 5 min (cursus topics)
    steps = Math.max(2, Math.min(12, Math.round(duration / SECONDS_PER_STEP)));
  }
  const words = Math.round(duration * WORDS_PER_SECOND);

  const courseworkNote = coursework ? `${coursework}\n${COURSEWORK_RULES}\n\n` : '';
  const task = `${context ? `${context}\n\n` : ''}${courseworkNote}Explain "${subject}" on the whiteboard in about ${duration} seconds of speech, for ${AUDIENCE[difficulty]}
Write exactly ${steps} step${steps > 1 ? 's' : ''}. Each step has:
- "say": what you say while that part is drawn (plain spoken sentences, no markdown). All steps together: about ${words} words, so roughly ${Math.round(words / steps)} words per step.
- "elements": what you draw during it (typically 2-12 elements). The drawing must match what you say.
Output: { "title": string, "steps": [ { "say": string, "elements": [ ... ] } ] }
${languageRule(lang)}`;

  let prompt = task;
  let best = null; // last schema-valid lesson (layout problems are not fatal)
  let lastErrors = [];
  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    let draft;
    try {
      draft = await generateJSON({ system: SYSTEM, prompt, thinkingLevel, model, meter }); // repairs are billed too
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      lastErrors = [`response was not valid JSON: ${err.message}`];
      prompt = `${task}\n\nYour previous answer was not valid JSON (${err.message}). Answer again with valid JSON only.`;
      continue;
    }
    const lesson = toLesson(draft, lang);
    const { errors } = validateSpec(lesson.spec, { cues: lesson.narration.map((s) => s.id) });
    errors.push(...lesson.narration.filter((s) => !s.text).map((s) => `${s.id}: "say" is empty`));
    let problems = [];
    if (!errors.length) {
      problems = lintLayout(expandSpec(lesson.spec));
      best = { lesson, attempts: attempt, layoutProblems: problems };
      if (!problems.length) return best;
    }
    lastErrors = errors.length ? errors : problems;
    prompt = `${task}

Your previous answer:
${JSON.stringify(draft)}

It has these problems:
- ${lastErrors.slice(0, 30).join('\n- ')}

(steps[i] refers to your steps array.) Fix them and return the full corrected JSON.`;
  }
  if (best) return best; // valid, with some layout problems left
  throw new Error(`diagram still invalid after ${MAX_REPAIRS} repairs: ${lastErrors.slice(0, 5).join('; ')}`);
}

/**
 * { title, steps: [{ say, elements }] } -> { title, narration: [{ id, text }], spec }.
 * Components that write words themselves (the replication fork) get the lesson language.
 */
function toLesson(draft, lang = 'en') {
  const steps = Array.isArray(draft?.steps) ? draft.steps : [];
  for (const step of steps) {
    for (const el of Array.isArray(step?.elements) ? step.elements : []) {
      if (el?.type === 'replicationFork') {
        if (lang === 'en') delete el.lang;
        else el.lang = lang;
      }
    }
  }
  const narration = steps.map((s, i) => ({ id: `s${i + 1}`, text: String(s?.say ?? '').trim() }));
  const spec = {
    title: String(draft?.title ?? '').slice(0, 200),
    steps: steps.map((s, i) => ({ cue: `s${i + 1}`, elements: s?.elements })),
  };
  return { title: spec.title, narration, spec };
}

/** Three follow-on topics for the lesson just given (fast: low thinking). */
export async function suggestNextLessons({ title, subject, narration, difficulty = 'undergraduate', coursework = '', model, lang = 'en', meter }) {
  lang = normLang(lang);
  if (!(difficulty in AUDIENCE)) difficulty = 'undergraduate';
  const said = (Array.isArray(narration) ? narration : []).map((s) => String(s?.text ?? '')).join(' ').slice(0, 3000);
  const { suggestions } = await generateJSON({
    model,
    meter,
    system: 'You are a university lecturer planning a sequence of short whiteboard explanations.',
    prompt: `You just explained "${String(title || subject || '').slice(0, 200)}" to ${AUDIENCE[difficulty]}
What you said: ${said}
${coursework ? `
${coursework}
Prefer topics that build on this coursework; do not suggest a topic already covered on the list.
` : ''}
Suggest 3 different topics for the NEXT short whiteboard explanation, each a natural continuation:
1) the logical next step in the sequence, 2) a deeper look at one part of what you just drew, 3) a related application or consequence.
Each "subject" is a short, specific topic title (max 10 words) that can be drawn as a diagram; "reason" is one short sentence.
Write "subject" and "reason" in ${LANGUAGES[lang]}.`,
    schema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: { subject: { type: 'string' }, reason: { type: 'string' } },
            required: ['subject', 'reason'],
          },
        },
      },
      required: ['suggestions'],
    },
  });
  return { suggestions: suggestions.slice(0, 3).map((s) => ({ subject: s.subject.trim().slice(0, 120), reason: s.reason.trim().slice(0, 200) })) };
}

const ANSWER_SECONDS = 20;

/**
 * A student interrupted `lesson` (at step `atStep`) with `question`: a short
 * whiteboard demo answering it, on a clean board, that leads back to the lesson.
 */
export async function generateAnswerLesson({ question, lesson, atStep, difficulty, thinkingLevel, coursework = '', model, lang = 'en', meter }) {
  question = String(question ?? '').trim().slice(0, 500);
  if (!question) throw Object.assign(new Error('question is required'), { status: 400 });
  const narration = Array.isArray(lesson?.narration) ? lesson.narration : [];
  const steps = Array.isArray(lesson?.spec?.steps) ? lesson.spec.steps : [];
  const upTo = Math.max(0, Math.min(steps.length - 1, Number(atStep) || 0));
  const said = narration.slice(0, upTo + 1).map((s) => String(s?.text ?? '')).join(' ').slice(0, 4000);
  const board = JSON.stringify(steps.slice(0, upTo + 1).flatMap((s) => s?.elements ?? [])).slice(0, 8000);

  const context = `You were explaining "${String(lesson?.title ?? '').slice(0, 200)}" on the whiteboard when a student interrupted you.
What you had said so far: ${said}
What was on the board (elements, 1000x560): ${board}
The student's question: "${question}"

Answer this question now, on a CLEAN whiteboard (the previous drawing is set aside). In the first step, briefly acknowledge the question.
Draw whatever best answers it (you may redraw part of the previous diagram if useful). In the last step, lead back to the lecture in one short sentence (e.g. "Now, back to where we were.").`;

  return generateWhiteboardLesson({
    subject: `the student's question: ${question}`,
    length: ANSWER_SECONDS,
    lengthUnit: 'seconds',
    difficulty,
    thinkingLevel,
    context,
    coursework,
    model,
    lang,
    meter,
  });
}

export const MAX_QUIZ_QUESTIONS = 20;

/**
 * Multiple-choice quiz on the most crucial points of a lesson: `count` questions, 3 options
 * each, one correct. Options are shuffled here so the right answer isn't always first.
 * Returns { questions: [{ question, options: [a, b, c], answer: 0-2 }] }.
 */
export async function generateQuiz({ title, narration, spec, difficulty = 'undergraduate', count = 5, lang = 'en', model, meter, maxChars = 5000 }) {
  lang = normLang(lang);
  if (!(difficulty in AUDIENCE)) difficulty = 'undergraduate';
  count = Math.max(1, Math.min(MAX_QUIZ_QUESTIONS, Math.round(Number(count) || 5)));
  const said = (Array.isArray(narration) ? narration : []).map((s) => String(s?.text ?? '')).join(' ').slice(0, maxChars);
  const board = (Array.isArray(spec?.steps) ? spec.steps : []).flatMap((s) => s?.elements ?? [])
    .filter((e) => e?.type === 'text' || e?.type === 'math').map((e) => (e.type === 'math' ? e.tex : e.text)).join(' | ').slice(0, 2000);

  const { questions } = await generateJSON({
    model,
    meter,
    system: 'You are a university lecturer writing a short multiple-choice quiz to check that students understood a lesson.',
    prompt: `The lesson "${String(title ?? '').slice(0, 200)}", for ${AUDIENCE[difficulty]}
What was said: ${said}
${board ? `What was written on the board: ${board}\n` : ''}
Write exactly ${count} multiple-choice question${count > 1 ? 's' : ''} on the MOST CRUCIAL points of this lesson (no trivia), each with exactly 3 options and exactly one correct answer.
- Distractors must be plausible (typical misconceptions), never absurd.
- A question fits on one line: at most 110 characters. Options: at most 45 characters each.
- Plain text only (no LaTeX, no markdown): write formulas inline, e.g. "x = -b / 2a", "a^2 + b^2".
- Put the correct option first in "options" (it is shuffled afterwards).
Write everything in ${LANGUAGES[lang]}.`,
    schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: count,
          maxItems: count,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
            },
            required: ['question', 'options'],
          },
        },
      },
      required: ['questions'],
    },
  });

  const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return {
    questions: questions.slice(0, count).filter((q) => q?.question && q.options?.length === 3).map((q) => {
      const options = q.options.map((o) => clean(o, 80));
      const order = [0, 1, 2]; // Fisher-Yates: option 0 (the correct one) lands on A, B or C uniformly
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return { question: clean(q.question, 200), options: order.map((i) => options[i]), answer: order.indexOf(0) };
    }),
  };
}
