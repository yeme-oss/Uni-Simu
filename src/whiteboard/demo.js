// Whiteboard demo: narrated diagrams drawn on the whiteboard in sync with their
// voice (Gemini TTS). Lessons: the hardcoded replication fork, then any generated
// on the fly (the server validates every spec). Previous/Next moves between them;
// "Up next" suggests follow-on topics and preloads the chosen one so demos chain.
import { expandSpec } from './expand.js';
import { createNarrator, createEstimatedSource } from './narration.js';
import { createAnimator } from './animator.js';
import { createVoicePlayer } from '../voice.js';
import { toCaptions, timeCaptions } from '../captions.js';
import { createCoursework, getLesson, getLocalLesson } from './coursework.js';
import { recordCost } from '../costMeter.js';
import { elementAt } from './hittest.js';
import { createPushToTalk } from '../pushToTalk.js';
import { createCursus } from './cursus.js';
import { freeLecture } from './freeLectures.js';
import { createFreeMenu } from './freeMenu.js';
import { t, tn, getLang, setLang, onLangChange, applyTranslations, formatSeconds } from '../i18n.js';

const DEMO_ID = 'builtin-replication-fork'; // the hardcoded lesson keeps one id, so saving it never duplicates it
const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const LENGTH_LIMITS = {
  seconds: { min: 5, max: 120, value: 20 },
  steps: { min: 1, max: 12, value: 4 },
};

/** Voice the selected teacher model speaks with: 'female', or 'male' (also for the no-teacher and 2D modes). */
const teacherVoice = () => (document.getElementById('wb-teacher')?.value === 'female' ? 'female' : 'male');
/** Model level to ask for; the server only honours it when selection is unlocked (FOSS release). */
const modelTier = () => document.getElementById('wb-model')?.value ?? 'lite';

async function fetchVoice(text, voice, teacher, model) {
  const res = await fetch('/api/lecture/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, teacher, model }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `voice failed (${res.status})`);
  try { recordCost(JSON.parse(res.headers.get('X-Gemini-Cost'))); } catch { /* no cost header */ }
  return voice.decode(await res.arrayBuffer());
}

// Membership license key (Gumroad), kept in this browser and sent with every request.
const LICENSE_STORE = 'wb-license';
const licenseKey = () => { try { return localStorage.getItem(LICENSE_STORE) ?? ''; } catch { return ''; } };
const setLicenseKey = (key) => { try { key ? localStorage.setItem(LICENSE_STORE, key) : localStorage.removeItem(LICENSE_STORE); } catch { /* ignore */ } };
const withLicense = (options = {}) => (licenseKey() ? { ...options, headers: { ...options.headers, 'X-License-Key': licenseKey() } } : options);

/** A readable message for a failed request: the daily limit and license problems get their own. */
function errorText(err) {
  if (err.code === 'quota') return t(err.membership ? 'quota.reachedJoin' : 'quota.reached', { limit: err.limit });
  if (err.code === 'license') return t('member.bad', { error: err.message });
  return err.message;
}

// Requests that use up the daily allowance: the allowance line is refreshed after each one.
const COUNTED = /\/api\/whiteboard\/(generate|answer)$/;
let onCounted = null;

async function fetchJSON(url, options) {
  const res = await fetch(url, withLicense(options));
  if (COUNTED.test(url)) setTimeout(() => onCounted?.(), 300);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `${url} failed (${res.status})`), { code: body.code, limit: body.limit, membership: body.membership });
  recordCost(body.cost); // Gemini spend of this request (top-right corner)
  return body;
}

/**
 * Timing source backed by the audio clock: a segment lasts as long as its clip
 * and its position is the playback position (frozen while suspended). Segments
 * whose clip failed fall back to the text-length estimate.
 */
function createAudioSource(voice, clips) {
  const estimate = createEstimatedSource();
  let usingAudio = false;
  return {
    begin(segment) {
      const clip = clips.get(segment.id);
      usingAudio = Boolean(clip);
      if (usingAudio) { voice.play(clip); return clip.duration; }
      voice.stop();
      return estimate.begin(segment);
    },
    tick: (dt) => { if (!usingAudio) estimate.tick(dt); },
    get position() { return usingAudio ? voice.position : estimate.position; },
    pause() { voice.pause(); estimate.pause(); },
    resume() { voice.resume(); estimate.resume(); },
    stop() { voice.stop(); estimate.stop(); },
  };
}

const seconds = formatSeconds; // "1.2 s" / "1,2 s"

// --- Settings, remembered between visits (localStorage, one key per control) ------
// Keys are the element ids (the radio group uses its name). Storage can be missing or
// blocked (private mode, previews): the page then simply starts with the defaults.
const SETTINGS = ['wb-subject', 'wb-difficulty', 'wb-thinking', 'wb-model', 'wb-teacher', 'wb-subtitles', 'wb-auto-queue', 'wb-use-coursework', 'wb-cw-private'];

const readSetting = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeSetting = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };

/** Restores every setting from localStorage and saves each one whenever it changes. */
function restoreSettings() {
  for (const id of SETTINGS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const stored = readSetting(id);
    const isBox = el.type === 'checkbox';
    if (stored !== null) {
      if (isBox) el.checked = stored === 'true';
      else if (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === stored)) el.value = stored;
    }
    el.addEventListener(isBox || el.tagName === 'SELECT' ? 'change' : 'input', () => writeSetting(id, isBox ? String(el.checked) : el.value));
  }

  // Length: the unit first (it sets the allowed range), then the number, kept within it.
  const radios = [...document.querySelectorAll('input[name="wbLengthUnit"]')];
  const length = document.getElementById('wb-length');
  const unit = readSetting('wbLengthUnit');
  const radio = radios.find((r) => r.value === unit);
  if (radio) radio.checked = true;
  const limits = LENGTH_LIMITS[radios.find((r) => r.checked).value];
  Object.assign(length, { min: limits.min, max: limits.max });
  const stored = Number(readSetting('wb-length'));
  length.value = stored >= limits.min && stored <= limits.max ? stored : limits.value;
  for (const r of radios) {
    r.addEventListener('change', () => {
      writeSetting('wbLengthUnit', r.value);
      setTimeout(() => writeSetting('wb-length', length.value)); // after the unit's default value is applied
    });
  }
  length.addEventListener('input', () => writeSetting('wb-length', length.value));
}
const QUIZ_QUESTIONS = 5;  // per demo (the quiz board pages through any number, up to 20)

/**
 * Wires the demo to the whiteboard and the panel controls. Returns
 * { update(dt), isSpeaking(dt) } to be called from the render loop.
 */
export function createWhiteboardDemo({ board, quizBoard = null }) {
  const $ = (id) => document.getElementById(id);
  const buttons = {
    play: $('wb-play'), pause: $('wb-pause'), interrupt: $('wb-interrupt'), resume: $('wb-resume'), restart: $('wb-restart'),
    generate: $('wb-generate'), go: $('wb-go'), prev: $('wb-prev'), next: $('wb-next'),
  };
  const fields = { subject: $('wb-subject'), length: $('wb-length'), difficulty: $('wb-difficulty'), thinking: $('wb-thinking') };
  const unitRadios = document.querySelectorAll('input[name="wbLengthUnit"]');
  const subtitlesBox = $('wb-subtitles');
  const subtitleBar = $('wb-subtitle-bar');
  // Scrolling transcript of the captions (shown beside the board in the landscape-phone 2D layout).
  const transcript = $('wb-transcript');
  const TRANSCRIPT_LINES = 40;
  function addTranscriptLine(text) {
    if (transcript.lastElementChild?.textContent === text) return;
    transcript.querySelector('.current')?.classList.remove('current');
    transcript.append(Object.assign(document.createElement('div'), { className: 'line current', textContent: text }));
    while (transcript.childElementCount > TRANSCRIPT_LINES) transcript.firstElementChild.remove();
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  const status = $('wb-status');
  const timer = $('wb-timer');
  const counter = $('wb-counter');
  const suggestionsBox = $('wb-suggestions');
  const questionBox = $('wb-question-box');
  const nextPrompt = $('wb-next-prompt');
  const mobilePause = $('wb-mobile-pause');
  const firstLoadBanner = $('wb-first-load');
  const firstLoadTitle = $('wb-first-load-title');
  const firstLoadTime = $('wb-first-load-time');
  const questionField = $('wb-question');
  buttons.ask = $('wb-ask');
  const autoQueueBox = $('wb-auto-queue');
  const courseworkBox = $('wb-use-coursework');

  restoreSettings();

  // Model level: locked to the server's default unless it allows selection (GitHub FOSS release).
  const modelSelect = $('wb-model');
  const modelHelp = $('wb-model-help');
  const modelTip = $('wb-model-tip');
  const preferredTier = modelSelect.value; // restored from localStorage; kept even while locked
  let modelSelection = false;
  modelTip.dataset.i18n = 'model.tip.locked';
  modelHelp.dataset.i18nTitle = 'model.help.locked';
  modelHelp.addEventListener('click', () => {
    modelTip.hidden = !modelTip.hidden;
    modelHelp.setAttribute('aria-expanded', String(!modelTip.hidden));
  });
  fetchJSON('/api/config').then((config) => {
    modelSelection = Boolean(config.modelSelection);
    const support = $('support-link'); // shown only when the server has a SUPPORT_URL
    if (config.supportUrl) Object.assign(support, { href: config.supportUrl, hidden: false });
    if (config.quota) { // daily allowance / membership (never in a FOSS copy without this configuration)
      $('wb-member').hidden = false;
      $('wb-license-form').hidden = !config.membership;
      if (config.membershipUrl) Object.assign($('wb-member-get'), { href: config.membershipUrl, hidden: false });
      refreshAllowance();
    }
    modelSelect.replaceChildren(...config.tiers.map((tier) => {
      const option = new Option(tier.label, tier.id);
      if (['lite', 'flash', 'pro'].includes(tier.id)) option.dataset.i18n = `model.${tier.id}`;
      return option;
    }));
    const allowed = modelSelection && config.tiers.some((t) => t.id === preferredTier);
    modelSelect.value = allowed ? preferredTier : config.defaultTier; // no change event: the saved preference stays
    if (modelSelection) {
      modelTip.dataset.i18n = 'model.tip.unlocked';
      modelHelp.dataset.i18nTitle = 'model.help.unlocked';
    }
    applyTranslations(modelSelect.closest('.field'));
    setState(state, statusKey);
  }).catch((err) => console.warn('[whiteboard] could not load /api/config, model selection stays locked:', err.message));

  const voice = createVoicePlayer();
  const animator = createAnimator({ canvas: board.canvas });
  // Lessons: { title, subject, difficulty, narration, steps (expanded), clips (Map, or null until
  // first played), suggestions (null | 'loading' | [{ subject, reason, state, ... }]), chosen (index) }
  const lessons = [];
  let index = -1;
  let narrator = null;
  let captions = [];      // timed captions of the segment being spoken
  let shownCaption = null;
  let state = 'idle';     // 'idle' | 'loading' | 'generating' | 'playing' | 'interrupted' | 'done'
  let statusKey = null;   // i18n key of a custom status message (null = the state's own label)
  let generation = null;  // { started, phase, phaseStarted, diagramMs } while the Generate button runs
  let chainTo = null;     // suggestion to play as soon as its preload finishes (Space was pressed)
  let followUpFrom = null; // lesson that just ended, whose "Up next" choice Space will play
  let backTo = null;      // { entry, segment }: an answer just ended, Space goes back to this lesson
  let chipStates = [];    // [{ suggestion, span }] for live preload timers
  let playing = null;     // lesson being narrated (a list entry, or an answer to a question)
  let returnPoint = null; // { entry, segment }: where to pick the lesson up after answering a question
  let firstDemoPlayed = false; // the first demo of the session is the slow one: it gets a banner
  let firstLoadStarted = null; // performance.now() while that first demo is being prepared
  let topicLoading = null;     // { c, topic, number, started, error } while a cursus topic is prepared (full-screen overlay)

  const lesson = () => lessons[index];

  /** Banner over the scene while the session's first demo is prepared (later ones are preloaded). */
  function updateFirstLoadBanner(next) {
    const preparing = next === 'loading' || next === 'generating';
    if (next === 'playing') firstDemoPlayed = true;
    if (preparing && !firstDemoPlayed) firstLoadStarted ??= performance.now();
    else firstLoadStarted = null;
    firstLoadBanner.hidden = firstLoadStarted === null;
    if (firstLoadStarted !== null) {
      firstLoadTitle.textContent = t(next === 'generating' ? 'first.writing' : 'first.preparing');
    }
  }
  const lengthUnit = () => document.querySelector('input[name="wbLengthUnit"]:checked').value;

  /** Switches state; `messageKey` (an i18n key) replaces the state's own status label. */
  function setState(next, messageKey = null) {
    state = next;
    statusKey = messageKey;
    const stateKey = next === 'playing' && playing?.question ? 'status.answeringPlay' : `status.${next}`;
    status.textContent = t(messageKey ?? stateKey);
    const busy = next === 'loading' || next === 'generating' || next === 'answering';
    buttons.play.disabled = busy || !lesson() || !['idle', 'done'].includes(next);
    buttons.pause.disabled = next !== 'playing';
    buttons.interrupt.disabled = next !== 'playing';
    buttons.resume.disabled = next !== 'interrupted' && next !== 'paused';
    buttons.restart.disabled = busy || !lesson() || next === 'idle';
    buttons.generate.disabled = busy || !fields.subject.value.trim();
    buttons.go.disabled = buttons.generate.disabled; // the phone shortcut next to the subject
    buttons.prev.disabled = busy || index <= 0;
    buttons.next.disabled = busy || index >= lessons.length - 1;
    for (const el of [...Object.values(fields), ...unitRadios]) el.disabled = busy;
    modelSelect.disabled = busy || !modelSelection; // locked unless the server unlocks it
    questionBox.hidden = next !== 'interrupted' && next !== 'answering';
    questionField.disabled = next === 'answering';
    buttons.ask.disabled = next !== 'interrupted' || !questionField.value.trim();
    // Phone pause button: while a demo is on, ❚❚ pauses and ▶ resumes.
    const halted = next === 'paused' || next === 'interrupted';
    mobilePause.hidden = next !== 'playing' && !halted;
    mobilePause.textContent = halted ? '▶' : '❚❚';
    mobilePause.toggleAttribute('data-paused', halted);
    mobilePause.dataset.i18nAriaLabel = halted ? 'mobile.resume' : 'mobile.pause';
    mobilePause.setAttribute('aria-label', t(mobilePause.dataset.i18nAriaLabel));
    counter.textContent = playing?.question && next !== 'done'
      ? t('counter.answering', { question: t('quote', { s: playing.question }) })
      : lesson()?.series
        ? t('counter.slide', { i: lesson().series.index + 1, n: freeLecture(lesson().series.id, lesson().series.lang).slides.length, title: lesson().title })
        : lesson()?.cursus && cursus.where(lesson().cursus)
        ? t('counter.topic', { i: cursus.where(lesson().cursus).number, n: cursus.where(lesson().cursus).c.topicCount, title: lesson().title })
        : lesson() ? t('counter.demo', { i: index + 1, n: lessons.length, title: lesson().title }) : t('counter.none');
    updateFirstLoadBanner(next);
    if (topicLoading && !topicLoading.error && next !== 'loading' && next !== 'generating') hideTopicLoading();
    if (topicLoading) firstLoadBanner.hidden = true; // the overlay says it all
    renderSuggestions();
  }

  // `lang`: the language the lesson was made in (null for old coursework records that don't say).
  // `cursus`: { id, topicId } when the lesson teaches a topic of a cursus.
  const makeLesson = ({ title, spec, narration }, { subject, difficulty, clips = null, id = newId(), createdAt = new Date().toISOString(), lang = getLang(), cursus: link = null, series = null }) => ({
    id, createdAt, lang, cursus: link, series, // series: { id, lang, index } for a slide of a free lecture
    title: title || spec.title || subject || 'Untitled', subject: subject || title, difficulty,
    spec, narration, steps: expandSpec(spec), clips, suggestions: null, chosen: null,
  });

  /**
   * Makes a lesson and starts suggesting what could follow it right away, unless `suggest`
   * is false (the launch demo waits until it is actually played). Adds it to the
   * Previous / Next list unless `list` is false (preloads join it once studied).
   */
  function addLesson(generated, { suggest = true, list = true, ...options }) {
    const entry = makeLesson(generated, options);
    if (list) lessons.push(entry);
    if (suggest) ensureSuggestions(entry);
    return entry;
  }

  /**
   * Voices every narration segment (in parallel) with the selected teacher's voice; failed
   * clips fall back to estimated timing. The returned Map remembers which voice it holds.
   */
  async function voiceLesson(narration) {
    const teacher = teacherVoice();
    const model = modelTier();
    const results = await Promise.allSettled(narration.map((s) => fetchVoice(s.text, voice, teacher, model)));
    const clips = Object.assign(new Map(), { teacher, model });
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') clips.set(narration[i].id, r.value);
      else console.warn(`[whiteboard] voice for "${narration[i].id}" failed, using estimated timing:`, r.reason.message);
    });
    return clips;
  }

  /** Current panel settings for a generation about `subject`. */
  const PREVIOUS_SLIDES = 12; // how far back the teacher may refer

  /**
   * The slides studied before (and including) `upTo` in this sequence (the Previous / Next
   * list), for the teacher to refer back to: [{ title, said }]. Only this session's own
   * slides: never anybody else's lessons. [] when the option is off.
   */
  function previousSlides(upTo = lesson()) {
    if (!courseworkBox.checked || !upTo) return [];
    const end = lessons.indexOf(upTo);
    return lessons.slice(0, end + 1).slice(-PREVIOUS_SLIDES)
      .map((l) => ({ title: l.title, said: l.narration.map((s) => s.text).join(' ').slice(0, 400) }));
  }

  /** Panel settings for a new lesson about `subject`, following `after` (default: the current one). */
  const settingsFor = (subject, after = lesson()) => ({
    subject,
    previous: previousSlides(after),
    length: Number(fields.length.value),
    lengthUnit: lengthUnit(),
    difficulty: fields.difficulty.value,
    thinking: fields.thinking.value,
    model: modelTier(),
    lang: getLang(),
  });

  /** Generates a lesson and voices it; `onPhase('voice', diagramMs)` marks the switch. `list`: see addLesson. */
  async function generateLesson(settings, onPhase, { list = true } = {}) {
    const started = performance.now();
    const generated = await fetchJSON('/api/whiteboard/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const diagramMs = performance.now() - started;
    onPhase?.('voice', diagramMs);
    await board.loadFont();
    const clips = await voiceLesson(generated.narration);
    const { layoutProblems } = generated.generation;
    if (layoutProblems.length) console.warn(`[whiteboard] "${generated.title}" layout warnings:`, layoutProblems);
    console.log(`[whiteboard] generated "${generated.title}"`, generated);
    const entry = addLesson(generated, { subject: settings.subject, difficulty: settings.difficulty, clips, lang: settings.lang, cursus: settings.cursus ?? null, list });
    return { entry, generated, clips, diagramMs, voiceMs: performance.now() - started - diagramMs, totalMs: performance.now() - started };
  }

  // --- Up next: suggestions and preloading ----------------------------------

  /**
   * Fetches follow-on topics for `entry` (once). The first one is preloaded by
   * default, but only for the current lesson: preloads of preloads would cascade.
   */
  async function ensureSuggestions(entry) {
    if (entry.suggestions) return;
    if (entry.cursus) return cursusSuggestion(entry);
    if (entry.series) return seriesSuggestion(entry);
    entry.suggestions = 'loading';
    renderSuggestions();
    try {
      const { suggestions } = await fetchJSON('/api/whiteboard/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: entry.title, subject: entry.subject, narration: entry.narration, difficulty: entry.difficulty ?? fields.difficulty.value, previous: previousSlides(entry).slice(0, -1), model: modelTier(), lang: getLang() }),
      });
      entry.suggestions = suggestions.map((s) => ({ ...s, state: 'idle', parent: entry }));
      if (entry === lesson()) preloadDefault(entry);
    } catch (err) {
      console.warn('[whiteboard] suggestions failed:', err.message);
      entry.suggestions = null;
    }
    renderSuggestions();
  }

  /**
   * In a cursus, "Up next" is simply the next topic of the plan (none at the end, or while
   * its part is still being written: the plan's onChange fills it in later).
   */
  function cursusSuggestion(entry) {
    const topic = cursus.next(entry.cursus);
    entry.suggestions = topic ? [{ subject: topic.title, reason: topic.summary, state: 'idle', topic, cursusId: entry.cursus.id, watch: Boolean(entry.cursus.watch), parent: entry }] : [];
    entry.chosen = null;
    if (entry === lesson()) preloadDefault(entry);
    renderSuggestions();
  }

  /** A free lecture's "Up next" is its next slide (nothing after the last one). */
  function seriesSuggestion(entry) {
    const { id, lang, index } = entry.series;
    const lecture = freeLecture(id, lang);
    const next = lecture.slides[index + 1];
    entry.suggestions = next ? [{ subject: next.title, reason: lecture.title, state: 'idle', slide: { id, lang, index: index + 1 }, parent: entry }] : [];
    entry.chosen = null;
    if (entry === lesson()) preloadDefault(entry);
    renderSuggestions();
  }

  /** Called when `entry` becomes the current lesson: make sure something is preloading after it. */
  function preloadDefault(entry) {
    if (!Array.isArray(entry.suggestions)) return ensureSuggestions(entry);
    // A cursus always prepares its next topic: studying it in sequence is the point.
    if (entry.chosen === null && entry.suggestions.length && (autoQueueBox.checked || entry.cursus || entry.series)) choose(entry, 0);
  }

  /** Makes suggestion i the one that plays after `entry`, preloading it if needed. */
  function choose(entry, i) {
    entry.chosen = i;
    const s = entry.suggestions[i];
    if (s.state === 'idle' || s.state === 'error') preload(s);
    if (followUpFrom === entry && chainTo) followUp(); // Space already pressed: switch to this one
    renderSuggestions();
  }

  async function preload(s) {
    Object.assign(s, { state: 'loading', started: performance.now(), phase: 'writing', error: null });
    renderSuggestions();
    try {
      const { entry, totalMs } = s.slide
        ? await prepareSlide(s.slide, () => { s.phase = 'voicing'; })
        : s.topic
        ? await prepareTopic(cursus.get(s.cursusId), s.topic, () => { s.phase = 'voicing'; }, { list: false, watch: s.watch })
        : await generateLesson(settingsFor(s.subject, s.parent ?? lesson()), () => { s.phase = 'voicing'; }, { list: false });
      Object.assign(s, { state: 'ready', lesson: entry, ms: totalMs });
      if (chainTo === s && followUpFrom) playLesson(entry); // Space was pressed while it loaded
      // Cursus: keep two topics ready ahead of the one being taught (not more: it would cascade).
      else if ((s.topic || s.slide) && s.parent === lesson()) {
        ensureSuggestions(entry); // synchronous for a cursus topic (its "Up next" is the plan's next topic)
        preloadDefault(entry);
      }
    } catch (err) {
      Object.assign(s, { state: 'error', error: err.message });
      if (chainTo === s) chainTo = null;
    }
    renderSuggestions();
  }

  // --- Follow-up prompt: at the end of a demo, Space plays the chosen "Up next" --

  const chosenFollowUp = () => {
    const s = followUpFrom && Array.isArray(followUpFrom.suggestions) ? followUpFrom.suggestions[followUpFrom.chosen] : null;
    return s ?? null;
  };

  /** The current demo has ended: offer its chosen follow-up (played when the student presses Space). */
  function offerFollowUp(entry) {
    followUpFrom = entry;
    chainTo = null;
    renderFollowUpPrompt();
  }

  /** Space (or a click on the prompt): play the follow-up now, or as soon as it's preloaded. */
  function followUp() {
    if (backTo) { // after an answer: back to the lesson, replaying the interrupted segment
      const { entry, segment } = backTo;
      return play(entry, { from: segment });
    }
    const s = chosenFollowUp();
    if (!s) return;
    if (s.state === 'ready') return playLesson(s.lesson);
    chainTo = s;
    if (s.state === 'idle' || s.state === 'error') preload(s);
    renderFollowUpPrompt();
  }

  function followUpText() {
    if (backTo) return t('follow.back', { title: t('quote', { s: backTo.entry.title }) });
    const s = chosenFollowUp();
    if (!s && followUpFrom?.series) return t('follow.freeEnd');
    if (!s && followUpFrom?.cursus) return t(cursus.next(followUpFrom.cursus) ? 'follow.cursusWait' : 'follow.cursusEnd');
    if (!s) return t(followUpFrom?.suggestions === 'loading' ? 'follow.choosing' : 'follow.pick');
    const topic = t('quote', { s: s.subject });
    const time = s.started ? seconds(performance.now() - s.started) : '';
    if (chainTo === s) return t('follow.starting', { topic, time });
    switch (s.state) {
      case 'loading': return t('follow.pressLoading', { topic, time });
      case 'error': return t('follow.failed', { topic });
      default: return t('follow.press', { topic });
    }
  }

  function renderFollowUpPrompt() {
    nextPrompt.hidden = !followUpFrom && !backTo;
    if (!nextPrompt.hidden) nextPrompt.textContent = followUpText();
  }

  function hideFollowUpPrompt() {
    followUpFrom = null;
    backTo = null;
    chainTo = null;
    nextPrompt.hidden = true;
  }

  function chipStateText(s) {
    switch (s.state) {
      case 'loading': return t('chip.loading', { phase: t(`phase.${s.phase}`), time: seconds(performance.now() - s.started) });
      case 'ready': return t('chip.ready', { time: seconds(s.ms) });
      case 'error': return t('chip.error', { error: s.error });
      default: return t('chip.idle');
    }
  }

  function renderSuggestions() {
    const entry = lesson();
    chipStates = [];
    suggestionsBox.replaceChildren();
    if (!entry || !Array.isArray(entry.suggestions)) {
      const hint = Object.assign(document.createElement('span'), {
        className: 'wb-hint',
        textContent: t(entry?.suggestions === 'loading' ? 'upnext.thinking' : 'upnext.none'),
      });
      suggestionsBox.append(hint);
      return;
    }
    entry.suggestions.forEach((s, i) => {
      const chip = Object.assign(document.createElement('button'), { className: 'wb-chip', title: s.reason });
      chip.dataset.state = s.state;
      chip.setAttribute('aria-pressed', String(entry.chosen === i));
      const label = Object.assign(document.createElement('span'), { textContent: s.subject });
      const span = Object.assign(document.createElement('span'), { className: 'wb-chip-state', textContent: chipStateText(s) });
      chip.append(label, span);
      chip.addEventListener('click', () => choose(entry, i));
      suggestionsBox.append(chip);
      chipStates.push({ suggestion: s, span });
    });
  }

  // --- Playback ---------------------------------------------------------------

  function stopPlayback() {
    hideFollowUpPrompt();
    narrator?.stop();
    narrator = null;
    captions = [];
    shownCaption = null;
    subtitleBar.hidden = true;
    transcript.replaceChildren(); // a new narration starts a new transcript
  }

  /** Shows lesson i fully drawn (no voice); Play replays it with narration. */
  function select(i) {
    stopPlayback();
    chainTo = null;
    returnPoint = null;
    playing = null;
    index = i;
    animator.load(lesson().steps);
    animator.skipToEnd();
    quizBoard?.hide(); // the quiz belonged to the demo that ended
    setState('idle');
    preloadDefault(lesson());
  }

  /**
   * Narrates `entry` from segment `from` (earlier steps are drawn instantly).
   * At the end: `onEnd`, or by default chain to the chosen "Up next" demo.
   */
  function play(entry = lesson(), { from = 0, onEnd } = {}) {
    stopPlayback();
    voice.unlock(); // inside the click, so audio may start
    playing = entry;
    animator.load(entry.steps);
    animator.resume(); // a restart after an interrupt must not stay paused
    const stepByCue = new Map(entry.steps.map((s, i) => [s.cue, i]));
    narrator = createNarrator({ segments: entry.narration, source: createAudioSource(voice, entry.clips), canAdvance: () => animator.stepDone });
    narrator.on('segment:start', ({ segment, duration }) => {
      animator.drawStep(stepByCue.get(segment.id), { fitDuration: duration });
      captions = timeCaptions(toCaptions(segment.text), duration);
    });
    narrator.on('end', () => {
      if (onEnd) return onEnd();
      setState('done');
      if (entry.cursus) {
        if (!entry.cursus.watch) cursus.progress(entry.cursus, { done: true }); // watching someone's cursus changes nothing
        showPartQuiz(entry); // a cursus has its quiz at the end of each part, not of each topic
      } else if (entry.series) {
        showFreeQuiz(entry); // a free lecture: its own quiz after the last slide
      } else {
        showQuiz(entry); // the end-of-demo quiz on the left board
      }
      offerFollowUp(entry);
    });
    narrator.play(from);
    setState('playing');
    if (!entry.question) {
      quizBoard?.hide();
      if (!entry.cursus && !entry.series) ensureQuiz(entry); // written while the demo plays, so it's ready at the end
      preloadDefault(entry);
      if (from === 0 && !entry.cursus?.watch) { // taught: it now belongs to the coursework (and the cursus knows its lesson)
        const duration = entry.clips ? [...entry.clips.values()].reduce((sum, clip) => sum + clip.duration, 0) : undefined;
        coursework.save({ ...entry, duration, cursusId: entry.cursus?.id, topicId: entry.cursus?.topicId });
        if (entry.cursus) cursus.progress(entry.cursus, { lessonId: entry.id });
      }
    }
  }

  // --- End-of-demo quiz (left board) ------------------------------------------------------
  /** Starts writing the quiz of `entry` (once); a failed attempt is forgotten so it can be retried. */
  function ensureQuiz(entry) {
    if (!quizBoard || entry.quiz) return entry.quiz;
    entry.quiz = fetchJSON('/api/whiteboard/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: entry.title, narration: entry.narration, spec: entry.spec, count: QUIZ_QUESTIONS,
        difficulty: entry.difficulty ?? fields.difficulty.value, lang: entry.lang ?? getLang(), model: modelTier(),
      }),
    }).then((r) => r.questions);
    entry.quiz.catch((err) => {
      console.warn(`[whiteboard] quiz for "${entry.title}" failed:`, err.message);
      entry.quiz = null;
    });
    return entry.quiz;
  }

  function showQuiz(entry) {
    if (!quizBoard) return;
    quizBoard.showLoading(entry.title);
    ensureQuiz(entry)?.then(
      (questions) => { if (playing === entry && state === 'done') quizBoard.show(entry.title, questions); },
      () => { if (playing === entry) quizBoard.showError(entry.title); },
    );
  }

  // --- Cursus ----------------------------------------------------------------------
  const partQuizzes = new Map(); // "cursusId:partIndex" -> promise of questions

  /** What was said in each topic of the part, as far as this browser knows: { topicId: text }. */
  function partNarrations(at) {
    const out = {};
    for (const topic of at.part.topics ?? []) {
      const lesson = lessons.find((l) => l.cursus?.id === at.c.id && l.cursus.topicId === topic.id) ?? (topic.lessonId && getLocalLesson(topic.lessonId));
      if (lesson) out[topic.id] = lesson.narration.map((s) => s.text).join(' ').slice(0, 4000);
    }
    return out;
  }

  /** End of a cursus topic: the quiz of its part if it was the part's last topic, else a clean left board. */
  function showPartQuiz(entry) {
    const at = quizBoard && cursus.where(entry.cursus);
    if (!at?.isLastOfPart) return quizBoard?.hide();
    const key = `${at.c.id}:${at.partIndex}`;
    const title = t('quiz.partTitle', { n: at.partIndex + 1, title: at.part.title });
    quizBoard.showLoading(title);
    if (!partQuizzes.has(key)) {
      const pending = fetchJSON(`/api/cursus/${encodeURIComponent(at.c.id)}/quiz/${at.partIndex}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelTier(), narrations: partNarrations(at) }),
      }).then((r) => r.questions);
      pending.catch(() => partQuizzes.delete(key)); // a failed quiz can be asked for again
      partQuizzes.set(key, pending);
    }
    partQuizzes.get(key).then(
      (questions) => { if (playing === entry && state === 'done') quizBoard.show(title, questions); },
      (err) => { console.warn('[cursus] part quiz failed:', err.message); if (playing === entry) quizBoard.showError(title); },
    );
  }

  /** Settings for teaching `topic` of cursus `c` (the course's own length, level and language). */
  /** How the previous topic's lesson ended (its last two sentences), if this browser has it. */
  function previousTopicEnding(c, topic) {
    const prevId = `t${Number(topic.id.slice(1)) - 1}`;
    const prev = cursus.where({ id: c.id, topicId: prevId })?.topic;
    const lesson = lessons.find((l) => l.cursus?.id === c.id && l.cursus.topicId === prevId) ?? (prev?.lessonId && getLocalLesson(prev.lessonId));
    return lesson ? lesson.narration.slice(-2).map((s) => s.text).join(' ').slice(0, 600) : '';
  }

  const settingsForTopic = (c, topic) => ({
    subject: topic.title,
    length: c.topicSeconds,
    lengthUnit: 'seconds',
    difficulty: c.difficulty,
    thinking: fields.thinking.value,
    model: modelTier(),
    lang: c.lang,
    cursus: { id: c.id, topicId: topic.id, previousText: previousTopicEnding(c, topic) },
  });

  /**
   * A topic's lesson, ready to play: the one already taught (from the coursework, re-voiced)
   * or a new one written now with the course's context. Resolves like generateLesson.
   */
  async function prepareTopic(c, topic, onPhase, { list = true, watch = false } = {}) {
    if (topic.lessonId) {
      try {
        const started = performance.now();
        const record = await getLesson(topic.lessonId); // this browser's (private) lessons first
        onPhase?.('voice', 0);
        const clips = await voiceLesson(record.narration);
        const entry = makeLesson(record, {
          subject: record.subject, difficulty: record.difficulty, id: record.id, createdAt: record.createdAt,
          lang: record.lang ?? c.lang, clips, cursus: { id: c.id, topicId: topic.id, ...(watch && { watch: true }) },
        });
        if (list) lessons.push(entry);
        const totalMs = performance.now() - started;
        return { entry, totalMs, diagramMs: 0, voiceMs: totalMs, clips, generated: { generation: { attempts: 1, layoutProblems: [] } } };
      } catch (err) {
        if (watch) throw err; // a free lecture never generates anything
        console.warn('[cursus] saved lesson unavailable, writing it again:', err.message);
      }
    }
    if (watch) throw new Error(t('free.missingLesson'));
    return generateLesson(settingsForTopic(c, topic), onPhase, { list });
  }

  /** From the Cursus modal: teach `topic` now (its preloaded lesson if there is one). */
  // --- Full-screen overlay while a topic is prepared -----------------------------------
  const topicOverlay = $('wb-topic-loading');

  /** The overlay: `course` (small caps), `heading`, `summary`, `note`; `retry()` behind Try again. */
  function showPreparing({ course, heading, summary, note, retry }) {
    topicLoading = { started: performance.now(), error: null, retry };
    $('wb-tl-course').textContent = course;
    $('wb-tl-topic').textContent = heading;
    $('wb-tl-summary').textContent = summary;
    $('wb-tl-note').textContent = note;
    $('wb-tl-actions').hidden = true;
    $('wb-tl-spinner').hidden = false;
    delete topicOverlay.dataset.error;
    topicOverlay.hidden = false;
    renderTopicPhase();
  }

  function renderTopicPhase() {
    if (!topicLoading || topicLoading.error) return;
    const phase = generation?.phase ?? (state === 'loading' ? 'gen.voicing' : 'tl.preparing');
    const text = t('tl.phase', { phase: t(phase), time: seconds(performance.now() - topicLoading.started) });
    const el = $('wb-tl-phase');
    if (el.textContent !== text) el.textContent = text;
  }

  function failTopicLoading(error) {
    if (!topicLoading) return;
    topicLoading.error = error;
    topicOverlay.dataset.error = '';
    $('wb-tl-phase').textContent = t('tl.failed', { error });
    $('wb-tl-note').textContent = '';
    $('wb-tl-spinner').hidden = true;
    $('wb-tl-actions').hidden = false;
    $('wb-tl-retry').focus();
  }

  function hideTopicLoading() {
    topicLoading = null;
    topicOverlay.hidden = true;
  }

  $('wb-tl-close').addEventListener('click', hideTopicLoading);
  $('wb-tl-retry').addEventListener('click', () => {
    const retry = topicLoading?.retry;
    hideTopicLoading();
    retry?.();
  });

  function showTopicLoading(c, topic, { watch = false } = {}) {
    const number = cursus.where({ id: c.id, topicId: topic.id })?.number ?? Number(topic.id.slice(1));
    showPreparing({
      course: c.title,
      heading: t('tl.topic', { n: number, total: c.topicCount, title: topic.title }),
      summary: topic.summary,
      // The first topic of a session (or of the course) is the slow one: later ones are prepared while you listen.
      note: t(watch ? 'free.note' : number === 1 || !firstDemoPlayed ? 'tl.first' : 'tl.notReady'),
      retry: () => playTopic(c, topic, { watch }),
    });
  }

  // --- Free lectures (green card): hand-made slides, only their voice is fetched ----------
  /** The lesson for slide `index` of free lecture `id` (one entry per slide and language). */
  function freeEntry(id, lang, index) {
    const lecture = freeLecture(id, lang);
    const slide = lecture.slides[index];
    const entryId = `free-${id}-${lang}-${index + 1}`;
    return lessons.find((l) => l.id === entryId)
      ?? lessons.flatMap((l) => (Array.isArray(l.suggestions) ? l.suggestions : [])).find((s) => s.lesson?.id === entryId)?.lesson
      ?? makeLesson(slide, { subject: slide.title, difficulty: 'beginner', id: entryId, lang, series: { id, lang, index } });
  }

  /** A free slide ready to play (voiced; the server caches these clips). Resolves like generateLesson. */
  async function prepareSlide({ id, lang, index }, onPhase) {
    const started = performance.now();
    const entry = freeEntry(id, lang, index);
    onPhase?.('voice', 0);
    if (!entry.clips || entry.clips.teacher !== teacherVoice() || entry.clips.model !== modelTier()) entry.clips = await voiceLesson(entry.narration);
    return { entry, totalMs: performance.now() - started };
  }

  /** Green card: play free lecture `id` from slide `index` (false if busy generating). */
  function startFree(id, index = 0) {
    if (['loading', 'generating', 'answering'].includes(state)) return false;
    if (id.startsWith('cursus:')) { watchCursus(id.slice('cursus:'.length)); return true; }
    const lang = getLang();
    const lecture = freeLecture(id, lang);
    const entry = freeEntry(id, lang, index);
    if (!entry.clips) {
      showPreparing({
        course: `${lecture.icon} ${lecture.field}`,
        heading: t('tl.slide', { n: index + 1, total: lecture.slides.length, title: entry.title }),
        summary: lecture.title,
        note: t('free.note'),
        retry: () => startFree(id, index),
      });
    }
    playLesson(entry);
    return true;
  }

  createFreeMenu({ onStart: startFree });

  function showFreeQuiz(entry) {
    const { id, lang, index } = entry.series;
    const lecture = freeLecture(id, lang);
    if (!quizBoard) return;
    if (index < lecture.slides.length - 1) return quizBoard.hide();
    quizBoard.show(lecture.title, lecture.quiz);
  }

  /** Teach `topic` now (its preloaded lesson if there is one); `watch`: a completed cursus watched as a free lecture. */
  function playTopic(c, topic, { watch = false } = {}) {
    showTopicLoading(c, topic, { watch }); // hidden again as soon as it plays (setState)
    const same = (l) => l?.cursus?.id === c.id && l.cursus.topicId === topic.id && Boolean(l.cursus.watch) === watch;
    const ready = lessons.find(same) ?? lessons.flatMap((l) => (Array.isArray(l.suggestions) ? l.suggestions : []))
      .find((s) => s.state === 'ready' && same(s.lesson))?.lesson;
    if (ready) return playLesson(ready);
    onGenerate({ prepare: (onPhase) => prepareTopic(c, topic, onPhase, { watch }) });
  }

  /** "All full free lectures": watch completed cursus `cursusId` from its first topic (only saved lessons replay). */
  async function watchCursus(cursusId) {
    try {
      const c = await cursus.load(cursusId, { fresh: true });
      const first = c.acts[0]?.parts[0]?.topics?.[0];
      if (first) playTopic(c, first, { watch: true });
    } catch (err) {
      timer.textContent = t('cw.openFailed', { title: '', error: err.message });
    }
  }

  const cursus = createCursus({
    isBusy: () => ['loading', 'generating', 'answering'].includes(state),
    onPlayTopic: playTopic,
    settings: () => ({ difficulty: fields.difficulty.value, model: modelTier() }),
    onChange(c) { // a part was written: the current topic may now have its "Up next"
      const current = lesson();
      if (current?.cursus?.id === c.id && Array.isArray(current.suggestions) && !current.suggestions.length) {
        current.suggestions = null;
        cursusSuggestion(current);
        if (followUpFrom === current) renderFollowUpPrompt();
      }
    },
  });

  async function playLesson(entry) {
    chainTo = null;
    returnPoint = null;
    if (!lessons.includes(entry)) lessons.push(entry); // a preloaded lesson: studied now, so it joins Previous / Next
    index = lessons.indexOf(entry);
    await onPlay();
  }

  // --- Questions ---------------------------------------------------------------

  /** Segment to replay after a question: the one being spoken (from its start), or the next if between two. */
  function currentSegment() {
    if (!narrator) return 0;
    return narrator.state === 'gap' ? narrator.index + 1 : Math.max(0, narrator.index);
  }

  function onAsk(event) {
    event.preventDefault();
    const question = questionField.value.trim();
    if (question && state === 'interrupted') askQuestion(question);
  }

  /**
   * Answers `question` with a short demo, then goes back to the lesson: to the segment it
   * interrupted (when paused or interrupted mid-narration), or to its board as it was.
   */
  async function askQuestion(question) {
    const midLesson = (state === 'interrupted' || state === 'paused') && playing;
    // Questions asked during an answer go back to the original lesson, not to the answer.
    const back = returnPoint ?? backTo ?? (midLesson && !playing.question
      ? { entry: playing, segment: currentSegment() }
      : { entry: lesson(), segment: null }); // nothing was playing: come back to the finished board
    const context = back.entry;
    if (!context) return;
    const atSegment = back.entry === playing && back.segment !== null ? currentSegment() : back.segment ?? context.narration.length - 1;
    const atStep = Math.max(0, context.spec.steps.findIndex((s) => s.cue === context.narration[Math.min(atSegment, context.narration.length - 1)]?.id));
    const started = performance.now();
    generation = { started, phase: 'gen.thinking', phaseStarted: started };
    setState('answering');
    try {
      const generated = await fetchJSON('/api/whiteboard/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          lesson: { title: context.title, narration: context.narration, spec: context.spec },
          atStep,
          difficulty: context.difficulty ?? fields.difficulty.value,
          thinking: fields.thinking.value,
          model: modelTier(),
          previous: previousSlides(context).slice(0, -1), // the lesson itself is sent above
          lang: getLang(),
        }),
      });
      generation = { ...generation, phase: 'gen.voicingAnswer', phaseStarted: performance.now(), diagramMs: performance.now() - started };
      const clips = await voiceLesson(generated.narration);
      console.log(`[whiteboard] answer to "${question}"`, generated);
      timer.textContent = t('timer.answerReady', { time: seconds(performance.now() - started), diagram: seconds(generation.diagramMs) });
      generation = null;
      returnPoint = back;
      questionField.value = '';
      const answer = { ...makeLesson(generated, { subject: question, difficulty: context.difficulty, clips }), question };
      play(answer, { onEnd: resumeAfterAnswer });
    } catch (err) {
      generation = null;
      timer.textContent = t('timer.answerFailed', { time: seconds(performance.now() - started), error: errorText(err) });
      // Mid-lesson: still paused (Resume or ask again). Otherwise back to the board as it was.
      if (midLesson) setState('interrupted');
      else setState(lesson() ? 'done' : 'idle', 'status.error');
    }
  }

  /** After an answer: offer to go back (Space) to where the question interrupted the lesson. */
  function resumeAfterAnswer() {
    const back = returnPoint;
    returnPoint = null;
    if (!back) return setState('done');
    if (back.segment === null) { // nothing was playing when the question came: put its board back
      playing = null;
      animator.load(back.entry.steps);
      animator.skipToEnd();
      return setState('done');
    }
    backTo = back;
    setState('done', 'status.back');
    renderFollowUpPrompt();
  }

  // --- "Explain" menu: right-click (or long press) on something drawn on the board --------
  // main.js turns the click into board coordinates; this finds what's drawn there and,
  // on "Explain", pauses the lesson and asks the teacher about it (like Interrupt + Ask).
  const contextMenu = $('wb-context');
  const contextTarget = $('wb-context-target');
  const contextExplain = $('wb-context-explain');
  let contextQuestion = null;
  const shorten = (s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

  /**
   * Opens the menu at `at` (page coordinates) for the board point (boardX, boardY),
   * if something drawn is there; otherwise closes it.
   */
  function openContextMenu(at, boardX, boardY) {
    const shown = playing ?? lesson(); // the lesson whose drawing is on the board
    const hit = shown && animator.stepIndex >= 0 ? elementAt(shown.steps, animator.stepIndex, boardX, boardY) : null;
    if (!hit) return closeContextMenu();
    const where = { x: Math.round(boardX), y: Math.round(boardY) };
    if (hit.kind === 'math') {
      contextTarget.textContent = t('ctx.math', { s: shorten(hit.value) });
      contextQuestion = t('explain.math', { tex: hit.value });
    } else if (hit.kind === 'text') {
      contextTarget.textContent = t('ctx.text', { s: shorten(hit.value) });
      contextQuestion = t('explain.text', { text: hit.value });
    } else {
      contextTarget.textContent = t('ctx.part', { s: hit.value ? shorten(hit.value) : t('ctx.unnamed') });
      contextQuestion = hit.value ? t('explain.part', { label: hit.value, ...where }) : t('explain.unnamed', where);
    }
    const busy = ['loading', 'generating', 'answering'].includes(state);
    contextExplain.disabled = busy;
    contextExplain.title = busy ? t('ctx.wait') : '';
    contextMenu.hidden = false;
    // Keep it on screen (the body is the menu's frame, also when the 2D view is turned).
    const room = { w: document.body.clientWidth, h: document.body.clientHeight };
    contextMenu.style.left = `${Math.max(8, Math.min(at.x, room.w - contextMenu.offsetWidth - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(at.y, room.h - contextMenu.offsetHeight - 8))}px`;
    contextExplain.focus({ preventScroll: true });
  }

  function closeContextMenu() {
    contextMenu.hidden = true;
    contextQuestion = null;
  }

  function explainFromMenu() {
    const question = contextQuestion;
    closeContextMenu();
    if (!question || ['loading', 'generating', 'answering'].includes(state)) return;
    voice.unlock(); // inside the click, so the answer's voice may play
    if (state === 'playing') { // pause speech and drawing together, like Interrupt
      narrator.pause();
      animator.pause();
      setState('interrupted');
    }
    askQuestion(question);
  }

  contextExplain.addEventListener('click', explainFromMenu);
  addEventListener('pointerdown', (e) => { if (!contextMenu.hidden && !contextMenu.contains(e.target)) closeContextMenu(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !contextMenu.hidden) closeContextMenu(); });
  addEventListener('resize', closeContextMenu);

  // --- Push to talk: hold 🎤, ask out loud -------------------------------------
  // Pressing pauses the lesson (like Interrupt); on release Gemini transcribes the recording
  // and the question goes through the same path as a typed one.
  const pttStatus = $('ptt-status');
  let pttHide = null;
  let transcribing = false;
  function showPtt(key, params, { error = false, hideAfter = 0 } = {}) {
    clearTimeout(pttHide);
    pttStatus.textContent = t(key, params);
    pttStatus.dataset.kind = error ? 'error' : 'info';
    pttStatus.hidden = false;
    if (hideAfter) pttHide = setTimeout(() => { pttStatus.hidden = true; }, hideAfter);
  }
  const busyForPtt = () => transcribing || ['loading', 'generating', 'answering'].includes(state) || !(playing ?? lesson());

  createPushToTalk({
    button: $('ptt'),
    canStart() {
      if (!busyForPtt()) return true;
      showPtt('ptt.busy', {}, { hideAfter: 3000 });
      return false;
    },
    onStart() {
      voice.unlock(); // inside the press, so the answer's voice may play
      closeContextMenu();
      if (state === 'playing') {
        narrator.pause();
        animator.pause();
        setState('interrupted');
      }
      showPtt('ptt.listening');
    },
    onTooShort: () => showPtt('ptt.short', {}, { hideAfter: 3000 }),
    onError(kind, err) {
      console.warn('[ptt]', kind, err);
      showPtt(`ptt.${kind}`, { error: err?.message ?? '' }, { error: true, hideAfter: 6000 });
    },
    async onRecorded(wav) {
      transcribing = true;
      showPtt('ptt.transcribing');
      try {
        const { text } = await fetchJSON(`/api/whiteboard/transcribe?lang=${getLang()}&model=${encodeURIComponent(modelTier())}`, {
          method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav,
        });
        if (!text) return showPtt('ptt.empty', {}, { hideAfter: 4000 });
        if (['loading', 'generating', 'answering'].includes(state)) return showPtt('ptt.busy', {}, { hideAfter: 3000 });
        if (state === 'playing') { // resumed meanwhile: pause again, the question is about this moment
          narrator.pause();
          animator.pause();
          setState('interrupted');
        }
        showPtt('ptt.heard', { s: t('quote', { s: text }) }, { hideAfter: 5000 });
        questionField.value = text; // visible in the question box while the answer is prepared
        askQuestion(text);
      } catch (err) {
        showPtt('ptt.failed', { error: err.message }, { error: true, hideAfter: 6000 });
      } finally {
        transcribing = false;
      }
    },
  });

  // --- Coursework database ---------------------------------------------------

  const coursework = createCoursework({
    isBusy: () => ['loading', 'generating', 'answering'].includes(state),
    async onPlay(record) {
      let entry = lessons.find((l) => l.id === record.id);
      if (!entry) {
        // A cursus topic's lesson goes on with its cursus (if that cursus still exists).
        const link = record.cursusId ? await cursus.load(record.cursusId).then(() => ({ id: record.cursusId, topicId: record.topicId }), () => null) : null;
        entry = makeLesson(record, { subject: record.subject, difficulty: record.difficulty, id: record.id, createdAt: record.createdAt, lang: record.lang ?? null, cursus: link });
        lessons.push(entry); // voice and suggestions come when it is played
      }
      playLesson(entry);
    },
  });
  autoQueueBox.addEventListener('change', () => {
    if (autoQueueBox.checked && lesson()?.suggestions) preloadDefault(lesson());
  });

  async function onPlay() {
    voice.unlock();
    returnPoint = null;
    const current = lesson();
    // Voice on first play, and again if the teacher (hence the voice) changed since.
    if (!current.clips || current.clips.teacher !== teacherVoice() || current.clips.model !== modelTier()) {
      stopPlayback();
      setState('loading');
      current.clips = await voiceLesson(current.narration);
    }
    play();
  }

  /** Generate button (or a cursus topic: `prepare(onPhase)` resolves like generateLesson). */
  async function onGenerate({ prepare } = {}) {
    voice.unlock();
    stopPlayback();
    chainTo = null;
    returnPoint = null;
    animator.pause();
    const started = performance.now();
    generation = { started, phase: 'gen.writing', phaseStarted: started };
    setState('generating');
    try {
      const onPhase = (_, diagramMs) => {
        generation = { ...generation, phase: 'gen.voicing', phaseStarted: performance.now(), diagramMs };
      };
      const result = await (prepare ? prepare(onPhase) : generateLesson(settingsFor(fields.subject.value), onPhase));
      const { attempts, layoutProblems } = result.generated.generation;
      const speech = [...result.clips.values()].reduce((s, c) => s + c.duration, 0);
      const notes = [tn('timer.attempts', attempts)];
      if (layoutProblems.length) notes.push(tn('timer.warnings', layoutProblems.length));
      timer.textContent = t('timer.ready', {
        total: seconds(result.totalMs), diagram: seconds(result.diagramMs), notes: notes.join(', '),
        voice: seconds(result.voiceMs), speech: speech.toFixed(0),
      });
      generation = null;
      index = lessons.indexOf(result.entry);
      play();
    } catch (err) {
      generation = null;
      timer.textContent = t('timer.failed', { time: seconds(performance.now() - started), error: errorText(err) });
      failTopicLoading(errorText(err)); // a cursus topic: the overlay shows the error, with Try again
      setState(lesson() ? 'done' : 'idle', 'status.error');
    }
  }

  for (const radio of unitRadios) {
    radio.addEventListener('change', () => Object.assign(fields.length, LENGTH_LIMITS[lengthUnit()]));
  }
  buttons.play.addEventListener('click', onPlay);
  buttons.restart.addEventListener('click', onPlay);
  buttons.generate.addEventListener('click', () => onGenerate());
  buttons.go.addEventListener('click', () => onGenerate());
  buttons.prev.addEventListener('click', () => select(index - 1));
  buttons.next.addEventListener('click', () => select(index + 1));
  fields.subject.addEventListener('input', () => setState(state, statusKey));
  buttons.interrupt.addEventListener('click', () => {
    // Speech and drawing stop together; the student can now ask a question.
    narrator.pause();
    animator.pause();
    setState('interrupted');
    questionField.focus();
  });
  buttons.resume.addEventListener('click', () => {
    narrator.resume();
    animator.resume();
    setState('playing');
  });
  buttons.pause.addEventListener('click', () => {
    narrator.pause();
    animator.pause();
    setState('paused');
  });
  mobilePause.addEventListener('click', () => (state === 'playing' ? buttons.pause : buttons.resume).click());
  questionBox.addEventListener('submit', onAsk);
  nextPrompt.addEventListener('click', followUp);
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || (!followUpFrom && !backTo) || e.target.closest?.('textarea, input, select')) return;
    e.preventDefault(); // not a click on whichever button has focus
    e.stopPropagation(); // nor a push-to-talk press, if 🎤 has focus
    document.activeElement?.blur?.();
    followUp();
  }, true); // capture: before the focused element sees the key
  questionField.addEventListener('input', () => setState(state, statusKey));
  questionField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); questionBox.requestSubmit(); }
  });

  // --- Daily allowance and membership key (shown only when the server configures them) --------
  let memberMessage = '';
  async function refreshAllowance() {
    if ($('wb-member').hidden) return;
    try {
      const res = await fetch('/api/quota', withLicense());
      const q = await res.json();
      const status = !q.enabled ? '' : q.error ? t('member.bad', { error: q.error })
        : q.tier === 'member' ? (q.limit ? t('member.status', { used: q.used, limit: q.limit }) : t('member.unlimited'))
          : q.limit ? t('quota.free', { used: q.used, limit: q.limit }) : '';
      $('wb-allowance').textContent = [status, memberMessage].filter(Boolean).join(' · ');
      $('wb-allowance').dataset.state = q.error ? 'error' : q.limit && q.used >= q.limit ? 'full' : q.tier;
      $('wb-license-remove').hidden = !licenseKey();
      $('wb-license').placeholder = t(licenseKey() ? 'member.placeholderSaved' : 'member.placeholder');
      memberMessage = '';
    } catch { /* the next refresh will tell */ }
  }
  $('wb-license-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('wb-license').value.trim();
    if (!key) return;
    setLicenseKey(key);
    $('wb-license').value = '';
    const res = await fetch('/api/quota', withLicense()).then((r) => r.json()).catch(() => null);
    if (res?.error) { setLicenseKey(''); memberMessage = ''; } // not a working key: forget it (the status says why)
    else memberMessage = t('member.thanks');
    await refreshAllowance();
    if (res?.error) $('wb-allowance').textContent = t('member.bad', { error: res.error });
  });
  $('wb-license-remove').addEventListener('click', () => { setLicenseKey(''); refreshAllowance(); });
  onCounted = refreshAllowance;

  // --- Language ---------------------------------------------------------------
  // The picker switches the interface right away; new Gemini requests use the new language.
  // Lessons already made keep theirs, but the built-in demo (when it isn't playing) and
  // unused suggestions are re-fetched in the new language.
  const langSelect = $('wb-lang');
  langSelect.value = getLang();
  langSelect.addEventListener('change', () => setLang(langSelect.value));
  applyTranslations();
  onLangChange(async () => {
    langSelect.value = getLang();
    for (const l of lessons) if (l !== playing) l.quiz = null; // quizzes are written in the interface language
    const current = lesson();
    const currentHadSuggestions = Array.isArray(current?.suggestions);
    for (const l of lessons) {
      if (Array.isArray(l.suggestions) && !l.suggestions.some((sg) => sg.state === 'loading' || sg.state === 'ready')) {
        l.suggestions = null;
        l.chosen = null;
      }
    }
    setState(state, statusKey);
    renderFollowUpPrompt();
    const demo = lessons.find((l) => l.id === DEMO_ID);
    if (demo && playing !== demo) {
      try {
        const lang = getLang();
        const fresh = await fetchJSON(`/api/whiteboard/demo?lang=${lang}`);
        Object.assign(demo, makeLesson({ title: fresh.spec.title, spec: fresh.spec, narration: fresh.narration },
          { difficulty: 'undergraduate', id: DEMO_ID, createdAt: demo.createdAt, lang }));
        if (lesson() === demo && state === 'idle' && animator.stepIndex >= 0) {
          animator.load(demo.steps);
          animator.skipToEnd();
        }
      } catch (err) {
        console.warn('[whiteboard] could not reload the demo in the new language:', err.message);
      }
    }
    if (currentHadSuggestions && current === lesson() && current.suggestions === null) preloadDefault(current);
    setState(state, statusKey);
  });

  // Blank board until something plays (uploaded by the next update); the
  // hardcoded demo is the first lesson in the list.
  animator.load([]);
  setState('idle');
  const demoLang = getLang();
  Promise.all([fetchJSON(`/api/whiteboard/demo?lang=${demoLang}`), board.loadFont()]).then(([demo]) => {
    addLesson({ title: demo.spec.title, spec: demo.spec, narration: demo.narration }, { difficulty: 'undergraduate', suggest: false, id: DEMO_ID, lang: demoLang });
    lessons.unshift(lessons.pop()); // first in the list, even if a generated lesson arrived before it
    index = index < 0 ? 0 : index + 1;
    setState(state, statusKey);
  }).catch((err) => { timer.textContent = t('demo.loadFailed', { error: err.message }); });

  return {
    update(dt) {
      narrator?.update(dt);
      if (animator.update(dt)) board.markDirty();
      // Subtitles follow the narration clock (frozen while interrupted).
      const caption = subtitlesBox.checked && narrator?.state === 'speaking'
        ? captions.findLast((c) => c.start <= narrator.position)?.text ?? ''
        : '';
      if (caption !== shownCaption) {
        shownCaption = caption;
        subtitleBar.textContent = caption;
        subtitleBar.hidden = !caption;
        if (caption) addTranscriptLine(caption);
      }
      if (transcript.hidden === subtitlesBox.checked) transcript.hidden = !subtitlesBox.checked;
      if (generation) {
        const now = performance.now();
        const done = generation.diagramMs ? t('timer.diagramDone', { time: seconds(generation.diagramMs) }) : '';
        timer.textContent = t('timer.live', {
          done, phase: t(generation.phase), time: seconds(now - generation.phaseStarted), total: seconds(now - generation.started),
        });
      }
      renderTopicPhase();
      if (firstLoadStarted !== null) {
        const text = seconds(performance.now() - firstLoadStarted);
        if (firstLoadTime.textContent !== text) firstLoadTime.textContent = text;
      }
      if (followUpFrom || backTo) {
        const text = followUpText();
        if (nextPrompt.textContent !== text) nextPrompt.textContent = text;
      }
      for (const { suggestion, span } of chipStates) {
        if (suggestion.state === 'loading') span.textContent = chipStateText(suggestion);
      }
    },
    /** Whether the teacher's voice is audible right now (drives his talking animation). */
    openContextMenu,
    isSpeaking(dt) {
      return state === 'playing' && narrator?.state === 'speaking' && voice.isVoiceActive(dt);
    },
    // For debugging / automated checks.
    debug: { animator, get narrator() { return narrator; }, voice, board, lessons },
  };
}
