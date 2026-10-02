// Node server: lecture-generation API + the three.js app (Vite in dev, dist/ in production).
import './server/env.js'; // .env settings, before any module reads them
import express from 'express';
import { createMeter } from './server/pricing.js';
import {
  TEXT_MODEL, IMAGE_MODEL, TTS_MODEL, TTS_VOICE, TTS_VOICE_FEMALE, MODEL_TIERS, DEFAULT_TIER, MODEL_SELECTION, resolveTier, transcribeAudio,
} from './server/gemini.js';
import { parseSettings, generateOutline, generateSpeech, generateSlideImage, generateVoice } from './server/lecture.js';
import { assertValidSpec } from './src/whiteboard/validate.js';
import { generateWhiteboardLesson, suggestNextLessons, generateAnswerLesson, generateQuiz } from './server/whiteboard.js';
import {
  listCoursework, getCoursework, saveLesson, deleteLesson, exportCoursework, importCoursework, previousSlidesDigest, courseworkStats,
} from './server/coursework.js';
import {
  listCursus, getCursus, createCursus, generatePart, deleteCursus, updateProgress, topicContext, partQuizSource, cursusStats, suggestFollowUps,
  listCompletedCursus, storedPartQuiz, storePartQuiz,
} from './server/cursus.js';
import { demoFor } from './src/whiteboard/demoReplicationFork.js';
import { voiceWithCache } from './server/voiceCache.js';
import { listRatings, rateLecture } from './server/ratings.js';
import {
  recordUsage, usageReport, ipReport, forgetIp, banIp, unbanIp, listBans, blockBanned, requireAdmin, ADMIN_ENABLED, RETENTION_DAYS,
} from './server/usage.js';

const PORT = Number(process.env.PORT) || 5173;
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const app = express();
// Behind a reverse proxy (nginx, Cloudflare…), the client IP is in X-Forwarded-For: set TRUST_PROXY=true.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', true);
// IPs banned from the admin panel can't use the API (the admin API stays reachable).
app.use('/api', (req, res, next) => (req.path.startsWith('/admin/') ? next() : blockBanned(req, res, next)));
// An imported coursework file can be large; its own parser runs first and the general one then skips it.
app.use('/api/coursework/import', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '1mb' }));

// JSON endpoints resolve to an object; media endpoints to { mimeType, data }.
// Each request gets a meter: the cost of the Gemini calls made to serve it is returned
// with the result ("cost" in JSON, the X-Gemini-Cost header for media), see pricing.js.
const handle = (fn, { media = false } = {}) => async (req, res) => {
  const meter = createMeter();
  try {
    const result = await fn(req.body, meter, req);
    const cost = meter.summary();
    recordUsage(req, cost).catch((err) => console.warn('[usage]', err.message)); // admin panel: tokens per IP
    if (media) res.set('X-Gemini-Cost', JSON.stringify(cost)).type(result.mimeType).send(result.data);
    else res.json({ ...result, cost });
  } catch (err) {
    console.error(`[${req.path}]`, err.message);
    res.status(err.status ?? 502).json({ error: err.message });
  }
};

// Past coursework, when the student let the teacher refer to it ('' when off or empty).
const digestFor = (body) => previousSlidesDigest(body.previous);

app.post('/api/lecture/outline', handle((body) => generateOutline(parseSettings(body))));

app.post('/api/lecture/speech', handle((body) => {
  const { subject, difficulty } = parseSettings(body);
  return generateSpeech({
    subject,
    difficulty,
    outline: body.outline,
    index: Number(body.index),
    wordsPerSlide: Math.max(20, Math.min(1000, Number(body.outline?.wordsPerSlide) || 150)),
  });
}));

app.post('/api/lecture/slide', handle((body) => {
  const { difficulty } = parseSettings(body);
  return generateSlideImage({ difficulty, outline: body.outline, index: Number(body.index) });
}, { media: true }));

// Free demo lectures' sentences are voiced once, then served from the cache (no Gemini cost).
app.post('/api/lecture/voice', handle((body, meter) => {
  const teacher = body.teacher === 'female' ? 'female' : 'male';
  const model = resolveTier(body.model).tts;
  return voiceWithCache(body.text, teacher, model, () => generateVoice(body.text, teacher, model, meter));
}, { media: true }));

// What the page may offer: model selection is locked to the default level unless
// ALLOW_MODEL_SELECTION=true (GitHub FOSS release). Enforced per request by resolveTier().
// "Support this app" link (top right): the Patreon page by default; SUPPORT_URL overrides it (https only).
const DEFAULT_SUPPORT_URL = 'https://www.patreon.com/c/PierreIgorZarebski';
const SUPPORT_URL = /^https:\/\/[^\s"<>]+$/.test(process.env.SUPPORT_URL ?? '') ? process.env.SUPPORT_URL : DEFAULT_SUPPORT_URL;

app.get('/api/config', (req, res) => {
  res.json({
    supportUrl: SUPPORT_URL,
    modelSelection: MODEL_SELECTION,
    defaultTier: DEFAULT_TIER,
    tiers: Object.entries(MODEL_TIERS).map(([id, t]) => ({ id, label: t.label, text: t.text, tts: t.tts })),
  });
});

// On-the-fly whiteboard lesson: narrated diagram steps written by the LLM, validated (and repaired) here.
app.post('/api/whiteboard/generate', handle(async (body, meter) => {
  const started = Date.now();
  const thinkingLevel = ['low', 'medium', 'high'].includes(body.thinking) ? body.thinking : 'medium';
  // A cursus topic gets the course's context (outline, what was taught, what comes next) instead of the coursework digest.
  const cursus = body.cursus?.id && body.cursus?.topicId ? await topicContext(String(body.cursus.id), String(body.cursus.topicId), { previousText: body.cursus.previousText }) : '';
  const { lesson, attempts, layoutProblems } = await generateWhiteboardLesson({
    subject: body.subject,
    length: body.length,
    lengthUnit: body.lengthUnit === 'steps' ? 'steps' : 'seconds',
    difficulty: body.difficulty,
    thinkingLevel,
    context: cursus,
    coursework: cursus ? '' : await digestFor(body),
    model: resolveTier(body.model).text,
    lang: body.lang,
    meter,
  });
  const ms = Date.now() - started;
  console.log(`[whiteboard] "${lesson.title}": ${lesson.spec.steps.length} steps in ${ms} ms (thinking ${thinkingLevel}), ${attempts} attempt(s), ${layoutProblems.length} layout problem(s) left`);
  return { ...lesson, generation: { ms, attempts, layoutProblems, thinkingLevel } };
}));

// A student's interrupting question: a short answer demo that leads back to the lesson.
app.post('/api/whiteboard/answer', handle(async (body, meter) => {
  const started = Date.now();
  const thinkingLevel = ['low', 'medium', 'high'].includes(body.thinking) ? body.thinking : 'medium';
  const { lesson, attempts, layoutProblems } = await generateAnswerLesson({
    question: body.question,
    lesson: body.lesson,
    atStep: body.atStep,
    difficulty: body.difficulty,
    thinkingLevel,
    coursework: await digestFor(body),
    model: resolveTier(body.model).text,
    lang: body.lang,
    meter,
  });
  const ms = Date.now() - started;
  console.log(`[whiteboard] answer "${lesson.title}" in ${ms} ms, ${attempts} attempt(s)`);
  return { ...lesson, generation: { ms, attempts, layoutProblems, thinkingLevel } };
}));

// Push-to-talk: the student's spoken question (a WAV recording) -> text.
const LANGUAGE_NAMES = { en: 'English', fr: 'French' };
app.post('/api/whiteboard/transcribe', express.raw({ type: ['audio/wav', 'audio/x-wav'], limit: '5mb' }), handle(async (body, meter, req) => {
  if (!Buffer.isBuffer(body) || body.length < 1000) throw Object.assign(new Error('no audio received'), { status: 400 });
  const text = await transcribeAudio({
    data: body,
    mimeType: 'audio/wav',
    language: LANGUAGE_NAMES[req.query.lang] ?? '',
    model: resolveTier(req.query.model).text,
    meter,
  });
  return { text };
}));

// End-of-demo quiz (left board): multiple-choice questions on the lesson's crucial points.
app.post('/api/whiteboard/quiz', handle((body, meter) => generateQuiz({
  title: body.title,
  narration: body.narration,
  spec: body.spec,
  difficulty: body.difficulty,
  count: body.count,
  lang: body.lang,
  model: resolveTier(body.model).text,
  meter,
})));

// Follow-on topics for the lesson being played ("Up next").
app.post('/api/whiteboard/suggest', handle(async (body, meter) => suggestNextLessons({
  title: body.title,
  subject: body.subject,
  narration: body.narration,
  difficulty: body.difficulty,
  coursework: await digestFor(body),
  model: resolveTier(body.model).text,
  lang: body.lang,
  meter,
})));

// Coursework database: list / play / delete, save a taught lesson, export and import the whole file.
const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    console.error(`[${req.path}]`, err.message);
    res.status(err.status ?? 500).json({ error: err.message });
  }
};
app.get('/api/coursework', route(() => listCoursework()));
// Size of everything saved: lessons, their total speaking time, cursus, and bytes on disk.
app.get('/api/coursework/stats', route(async () => {
  const [lessons, cursus] = await Promise.all([courseworkStats(), cursusStats()]);
  return { lessons: lessons.lessons, seconds: lessons.seconds, cursus: cursus.cursus, bytes: lessons.bytes + cursus.bytes };
}));
app.get('/api/coursework/export', async (req, res) => {
  res.attachment(`coursework-${new Date().toISOString().slice(0, 10)}.json`).type('json').send(JSON.stringify(await exportCoursework(), null, 1));
});
app.post('/api/coursework/import', route((req) => importCoursework(req.body)));
app.post('/api/coursework', route((req) => saveLesson(req.body)));
app.get('/api/coursework/:id', route((req) => getCoursework(req.params.id)));
app.delete('/api/coursework/:id', route((req) => deleteLesson(req.params.id)));

// Cursus: a long course planned as acts -> parts -> topics; topics become lessons when reached.
app.get('/api/cursus', route(() => listCursus()));
app.post('/api/cursus', handle((body, meter) => createCursus({
  domain: body.domain,
  module: body.module,
  totalMinutes: body.totalMinutes,
  topicSeconds: body.topicSeconds,
  level: body.level,
  difficulty: body.difficulty,
  lang: body.lang,
  parentId: body.parentId,
  relation: body.relation,
  model: resolveTier(body.model).text,
  meter,
})));
// After a completed cursus: 3 specialization paths, or 3 cross-domain companion courses.
app.post('/api/cursus/:id/followups', handle((body, meter, req) =>
  suggestFollowUps(req.params.id, body.kind, { refresh: Boolean(body.refresh), model: resolveTier(body.model).text, meter })));
app.get('/api/cursus/:id', route((req) => getCursus(req.params.id)));
app.delete('/api/cursus/:id', route((req) => deleteCursus(req.params.id)));
app.post('/api/cursus/:id/parts/:index', handle((body, meter, req) =>
  generatePart(req.params.id, Number(req.params.index), { model: resolveTier(body.model).text, meter })));
app.post('/api/cursus/:id/progress', route((req) => updateProgress(req.params.id, {
  topicId: String(req.body.topicId ?? ''), lessonId: req.body.lessonId, done: Boolean(req.body.done),
})));
// End-of-part quiz: on everything said in the part's lessons.
// Written once, then stored with the part: replays (and free watching) cost nothing.
app.post('/api/cursus/:id/quiz/:index', handle(async (body, meter, req) => {
  const index = Number(req.params.index);
  const stored = await storedPartQuiz(req.params.id, index);
  if (stored) return { questions: stored };
  const source = await partQuizSource(req.params.id, index, body.narrations);
  const quiz = await generateQuiz({ ...source, maxChars: 12000, model: resolveTier(body.model).text, meter });
  await storePartQuiz(req.params.id, index, quiz.questions);
  return quiz;
}));

// Completed cursus, listed with the free lectures (watched for free: their lessons are saved).
app.get('/api/free/lectures', route(async () => ({ cursus: await listCompletedCursus() })));

// Star ratings of the free lectures (anonymous reviewer id from the browser; see server/ratings.js).
app.get('/api/free/ratings', route((req) => listRatings(String(req.query.voter ?? ''))));
app.post('/api/free/ratings/:id', route((req) => rateLecture(req.params.id, { stars: req.body.stars, voter: req.body.voter })));

// Admin panel (admin.html): Gemini usage per IP. Off unless ADMIN_TOKEN (16+ characters) is set.
app.get('/api/admin/usage', requireAdmin, route((req) => usageReport({ days: req.query.days, page: req.query.page, perPage: req.query.perPage })));
app.get('/api/admin/usage/:ip', requireAdmin, route((req) => ipReport(req.params.ip)));
app.delete('/api/admin/usage/:ip', requireAdmin, route((req) => forgetIp(req.params.ip)));
app.get('/api/admin/bans', requireAdmin, route(() => listBans()));
app.put('/api/admin/bans/:ip', requireAdmin, route((req) => banIp(req.params.ip)));
app.delete('/api/admin/bans/:ip', requireAdmin, route((req) => unbanIp(req.params.ip)));

// Whiteboard demo (Milestone 1): hardcoded spec, validated before it's sent.
app.get('/api/whiteboard/demo', (req, res) => {
  try {
    const { spec, narration } = demoFor(req.query.lang); // ?lang=en|fr
    assertValidSpec(spec, { cues: narration.map((s) => s.id) });
    res.json({ spec, narration });
  } catch (err) {
    console.error(`[${req.path}]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

if (isProduction) {
  app.use(express.static('dist'));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    // The coursework file changes while lessons play; that must not reload the page.
    server: { middlewareMode: true, watch: { ignored: ['**/data/**'] } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`Classroom running at http://localhost:${PORT}`);
  console.log(`  text: ${TEXT_MODEL} | slides: ${IMAGE_MODEL} | voice: ${TTS_MODEL} (${TTS_VOICE} / ${TTS_VOICE_FEMALE})`);
  console.log(`  model selection: ${MODEL_SELECTION ? `unlocked (${Object.keys(MODEL_TIERS).join(', ')})` : `locked to ${MODEL_TIERS[DEFAULT_TIER].label} (set ALLOW_MODEL_SELECTION=true to unlock)`}`);
  console.log(`  admin panel: ${ADMIN_ENABLED ? `http://localhost:${PORT}/admin.html (usage kept ${RETENTION_DAYS} days)` : 'off (set ADMIN_TOKEN to enable it)'}`);
  if (!process.env.GEMINI_API_KEY) console.warn('Warning: GEMINI_API_KEY is not set — lecture generation will fail.');
});
