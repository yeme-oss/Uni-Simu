// Cursus modal: plan a long course on a module (acts -> numbered parts -> topics), browse
// the plan, and study it topic by topic. Topic lessons are written only when reached
// (demo.js asks for them); here the plan is made and progress is shown.
import { t, getLang, onLangChange } from '../i18n.js';
import { recordCost } from '../costMeter.js';
import { statsText } from './coursework.js';

async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `${url} failed (${res.status})`);
  if (body === null) throw new Error('the server did not answer with JSON (restart it: npm run dev)');
  recordCost(body.cost);
  return body;
}
const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const PART_CONCURRENCY = 4; // parts written at the same time (the rest wait their turn)

// Inspiration cloud: [domain, module] in each language.
const CLOUD = [
  { en: ['Biology', 'Microbiology of viruses'], fr: ['Biologie', 'Microbiologie des virus'] },
  { en: ['Energy', 'How solar panels work'], fr: ['Énergie', 'Théorie des panneaux solaires'] },
  { en: ['Climate', 'Geoengineering against global warming'], fr: ['Climat', 'Géo-ingénierie contre le réchauffement'] },
  { en: ['Artificial intelligence', 'Inside recent open-weight LLMs'], fr: ['Intelligence artificielle', 'Fonctionnement interne des LLM open weights récents'] },
  { en: ['Biology', 'Bacteria'], fr: ['Biologie', 'Les bactéries'] },
  { en: ['Physics', 'Quantum physics without scary equations'], fr: ['Physique', 'La physique quantique sans équations effrayantes'] },
  { en: ['Astronomy', 'Life and death of stars'], fr: ['Astronomie', 'Vie et mort des étoiles'] },
  { en: ['Neuroscience', 'How the brain makes memories'], fr: ['Neurosciences', 'Comment le cerveau fabrique la mémoire'] },
  { en: ['Chemistry', 'The chemistry of cooking'], fr: ['Chimie', 'La chimie de la cuisine'] },
  { en: ['Computer science', 'Cryptography, from Caesar to RSA'], fr: ['Informatique', 'La cryptographie, de César à RSA'] },
  { en: ['Mathematics', 'Probabilities that fool intuition'], fr: ['Mathématiques', 'Les probabilités qui trompent l’intuition'] },
  { en: ['Medicine', 'The immune system, a networked army'], fr: ['Médecine', 'Le système immunitaire, une armée en réseau'] },
  { en: ['Geology', 'Plate tectonics and volcanoes'], fr: ['Géologie', 'Tectonique des plaques et volcans'] },
  { en: ['Economics', 'Money: where does it really come from?'], fr: ['Économie', 'La monnaie : d’où vient-elle vraiment ?'] },
  { en: ['Engineering', 'How an aircraft flies'], fr: ['Ingénierie', 'Comment vole un avion'] },
  { en: ['History of science', 'The Darwinian revolution'], fr: ['Histoire des sciences', 'La révolution darwinienne'] },
  { en: ['Ecology', 'Oceans, the planet’s carbon pump'], fr: ['Écologie', 'Les océans, pompe à carbone de la planète'] },
  { en: ['Genetics', 'CRISPR and genome editing'], fr: ['Génétique', 'CRISPR et l’édition du génome'] },
  { en: ['Robotics', 'Seeing, grasping, walking: modern robots'], fr: ['Robotique', 'Voir, saisir, marcher : les robots modernes'] },
  { en: ['Physics', 'Nuclear fusion, the energy of the stars'], fr: ['Physique', 'La fusion nucléaire, l’énergie des étoiles'] },
  { en: ['Computer science', 'How the Internet really works'], fr: ['Informatique', 'Comment fonctionne vraiment Internet'] },
  { en: ['Biology', 'From one cell to a whole organism'], fr: ['Biologie', 'D’une cellule à un organisme entier'] },
  { en: ['Mathematics', 'Infinity and its paradoxes'], fr: ['Mathématiques', 'L’infini et ses paradoxes'] },
  { en: ['Materials', 'Semiconductors and the chip in your phone'], fr: ['Matériaux', 'Les semi-conducteurs et la puce de votre téléphone'] },
];

/** Same structure as the server's cursusShape (server/cursus.js), for the live preview. */
function shapeOf(totalMinutes, topicSeconds) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const topics = clamp(Math.round((totalMinutes * 60) / topicSeconds), 2, 240);
  const parts = clamp(Math.round(totalMinutes / 10), 1, Math.min(24, topics));
  return { topics, parts, acts: clamp(Math.max(Math.min(parts, 3), Math.round(parts / 3)), 1, 8) };
}

// Difficulty 0-100, a named level every 25 (the slider's marks; same scale as the server's levelInfo).
const LEVEL_STORE = 'wb-cu-level';
const levelName = (level) => t(`lvl.${Math.round(level / 25)}`);
/** "Medium", or "Between Medium and Expert, closer to Medium". */
function levelText(level) {
  const below = Math.floor(level / 25), above = Math.ceil(level / 25);
  if (below === above) return t(`lvl.${below}`);
  return t('cu.levelBetween', { a: t(`lvl.${below}`), b: t(`lvl.${above}`), near: levelName(level) });
}

const allParts = (c) => c.acts.flatMap((a) => a.parts);
const allTopics = (c) => allParts(c).flatMap((p) => p.topics ?? []);

/**
 * `isBusy()`: a generation is running (starting a topic now would clash).
 * `onPlayTopic(cursus, topic)`: teach that topic. `onChange(cursus)`: the plan or progress changed.
 * `settings()`: { difficulty, model } from the panel.
 */
export function createCursus({ isBusy, onPlayTopic, onChange = () => {}, settings }) {
  const $ = (id) => document.getElementById(id);
  const modal = $('wb-cu-modal');
  const home = $('wb-cu-home');
  const plan = $('wb-cu-plan');
  const message = $('wb-cu-message');
  const fields = { domain: $('wb-cu-domain'), module: $('wb-cu-module'), total: $('wb-cu-total'), topic: $('wb-cu-topic'), level: $('wb-cu-level') };
  try { // remembered between visits (storage may be unavailable)
    const stored = localStorage.getItem(LEVEL_STORE);
    if (stored !== null && Number.isFinite(Number(stored))) fields.level.value = stored;
  } catch { /* defaults */ }
  const renderLevel = () => { $('wb-cu-level-value').textContent = levelText(Number(fields.level.value)); };
  fields.level.addEventListener('input', () => {
    renderLevel();
    try { localStorage.setItem(LEVEL_STORE, fields.level.value); } catch { /* ignore */ }
  });
  renderLevel();
  const createButton = $('wb-cu-create');

  const records = new Map();    // id -> full cursus record (as last received)
  const partState = new Map();  // `${id}:${index}` -> 'loading' | 'error'
  const openParts = new Set();  // `${id}:${index}` of the parts unfolded in the plan
  let shown = null;             // id of the cursus whose plan is displayed
  let creating = false;

  function say(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  // --- Queries used by demo.js -------------------------------------------------------------

  /** Where a topic sits: { c, part, partIndex, topic, number, isLastOfPart } or null. */
  function where({ id, topicId }) {
    const c = records.get(id);
    if (!c) return null;
    const parts = allParts(c);
    for (let p = 0; p < parts.length; p++) {
      const k = (parts[p].topics ?? []).findIndex((x) => x.id === topicId);
      if (k >= 0) return { c, part: parts[p], partIndex: p, topic: parts[p].topics[k], number: parts[p].firstTopic + k, isLastOfPart: k === parts[p].topics.length - 1 };
    }
    return null;
  }

  /** The topic after `link`, or null (end of the course, or its part isn't written yet). */
  function next(link) {
    const at = where(link);
    if (!at) return null;
    const k = at.part.topics.indexOf(at.topic);
    if (k < at.part.topics.length - 1) return at.part.topics[k + 1];
    return allParts(at.c)[at.partIndex + 1]?.topics?.[0] ?? null;
  }

  /** Records progress on the server (and here): `lessonId` taught for the topic, `done` once finished. */
  async function progress(link, { lessonId, done } = {}) {
    const at = where(link);
    if (!at) return;
    at.c.current = at.topic.id;
    if (lessonId) at.topic.lessonId = lessonId;
    if (done) at.topic.done = true;
    render();
    try {
      await post(`/api/cursus/${encodeURIComponent(link.id)}/progress`, { topicId: link.topicId, lessonId, done });
    } catch (err) {
      console.warn('[cursus] could not save progress:', err.message);
    }
  }

  /** Makes sure the cursus is known here (for lessons reopened from the coursework). */
  async function load(id, { fresh = false } = {}) {
    if (fresh || !records.has(id)) records.set(id, await api(`/api/cursus/${encodeURIComponent(id)}`));
    return records.get(id);
  }

  // --- Making a plan -----------------------------------------------------------------------

  function renderShape() {
    const total = Number(fields.total.value);
    const topic = Math.max(20, Math.min(300, Number(fields.topic.value) || 120));
    const s = shapeOf(total, topic);
    $('wb-cu-shape').textContent = t('cu.shape', { topics: s.topics, parts: s.parts, acts: s.acts });
  }

  function create(event) {
    event.preventDefault();
    const domain = fields.domain.value.trim();
    const module = fields.module.value.trim();
    if (!domain && !module) return say(t('cu.needSubject'));
    startCursus({ domain, module, totalMinutes: Number(fields.total.value), topicSeconds: Number(fields.topic.value), level: Number(fields.level.value) });
  }

  /** Plans a new cursus (`parentId` + `relation`: one that follows a completed cursus) and opens it. */
  async function startCursus(options) {
    if (creating) return;
    creating = true;
    createButton.disabled = true;
    const started = performance.now();
    const tick = setInterval(() => say(t('cu.planning', { time: ((performance.now() - started) / 1000).toFixed(0) })), 500);
    say(t('cu.planning', { time: 0 }));
    try {
      const c = await post('/api/cursus', { ...options, model: settings().model, lang: getLang() });
      records.set(c.id, c);
      say('');
      showPlan(c.id);
      writeMissingParts(c);
    } catch (err) {
      say(t('cu.planFailed', { error: err.message }));
    } finally {
      clearInterval(tick);
      creating = false;
      createButton.disabled = false;
    }
  }

  /** Writes every part that has no topics yet, a few at a time, showing each as it arrives. */
  async function writeMissingParts(c) {
    const waiting = allParts(c).map((p, i) => i).filter((i) => !allParts(c)[i].topics && partState.get(`${c.id}:${i}`) !== 'loading');
    for (const i of waiting) partState.set(`${c.id}:${i}`, 'loading');
    render();
    const worker = async () => {
      while (waiting.length) {
        const i = waiting.shift();
        const key = `${c.id}:${i}`;
        try {
          const { topics } = await post(`/api/cursus/${encodeURIComponent(c.id)}/parts/${i}`, { model: settings().model });
          allParts(c)[i].topics = topics;
          partState.delete(key);
          onChange(c);
        } catch (err) {
          console.warn(`[cursus] part ${i + 1} failed:`, err.message);
          partState.set(key, 'error');
        }
        render();
      }
    };
    await Promise.all(Array.from({ length: PART_CONCURRENCY }, worker));
  }

  // --- Home: form, inspiration cloud, saved cursus ------------------------------------------

  function renderCloud() {
    const picks = [...CLOUD].sort(() => Math.random() - 0.5); // all of them, in a new order each time
    const lang = getLang();
    $('wb-cu-cloud').replaceChildren(...picks.map((item) => {
      const [domain, module] = item[lang] ?? item.en;
      const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'wb-cu-idea', textContent: module, title: `${domain} › ${module}` });
      chip.addEventListener('click', () => {
        fields.domain.value = domain;
        fields.module.value = module;
        fields.module.focus();
      });
      return chip;
    }));
    cloud.scrollLeft = 0;
    requestAnimationFrame(updateCarousel); // once laid out
  }

  // --- The carousel: ‹ › scroll a page; the arrows fade out at the ends; the wheel scrolls sideways.
  const cloud = $('wb-cu-cloud');
  function updateCarousel() {
    const left = cloud.scrollLeft > 2;
    const right = cloud.scrollLeft + cloud.clientWidth < cloud.scrollWidth - 2;
    $('wb-cu-prev').disabled = !left;
    $('wb-cu-next').disabled = !right;
    cloud.dataset.more = [left && 'left', right && 'right'].filter(Boolean).join(' ');
  }
  const page = (dir) => cloud.scrollBy({ left: dir * cloud.clientWidth * 0.85 });
  $('wb-cu-prev').addEventListener('click', () => page(-1));
  $('wb-cu-next').addEventListener('click', () => page(1));
  cloud.addEventListener('scroll', updateCarousel, { passive: true });
  addEventListener('resize', updateCarousel);
  cloud.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || cloud.scrollWidth <= cloud.clientWidth) return;
    e.preventDefault(); // a vertical wheel scrolls the carousel sideways
    cloud.scrollLeft += e.deltaY;
  }, { passive: false });

  function surprise() {
    const item = CLOUD[Math.floor(Math.random() * CLOUD.length)];
    [fields.domain.value, fields.module.value] = item[getLang()] ?? item.en;
  }

  async function renderList() {
    const list = $('wb-cu-list');
    statsText().then((text) => { $('wb-cu-stats').textContent = text; });
    try {
      const { cursus } = await api('/api/cursus');
      list.replaceChildren(...(cursus.length ? cursus.map(listItem)
        : [Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t('cu.none') })]));
    } catch (err) {
      list.replaceChildren(Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t('cu.loadFailed', { error: err.message }) }));
    }
  }

  function listItem(s) {
    const row = Object.assign(document.createElement('div'), { className: 'wb-cw-item' });
    const text = Object.assign(document.createElement('div'), { className: 'wb-cw-text' });
    const length = s.totalMinutes >= 60 ? `${s.totalMinutes / 60} h` : `${s.totalMinutes} min`;
    const meta = [s.lang?.toUpperCase(), s.domain, length, Number.isFinite(s.level) ? levelText(s.level) : '', t('cu.done', { done: s.done, n: s.topics }),
      s.parent && t(`cu.from.${s.parent.relation}`, { title: s.parent.title })].filter(Boolean).join(' · ');
    text.append(
      Object.assign(document.createElement('span'), { className: 'wb-cw-title', textContent: s.title }),
      Object.assign(document.createElement('span'), { className: 'wb-cw-meta', textContent: meta }),
    );
    const open = Object.assign(document.createElement('button'), { textContent: t('cu.openPlan') });
    open.addEventListener('click', async () => {
      try {
        records.set(s.id, await api(`/api/cursus/${encodeURIComponent(s.id)}`)); // fresh copy
        showPlan(s.id);
        writeMissingParts(records.get(s.id)); // e.g. the page was closed while it was being planned
      } catch (err) {
        say(t('cu.loadFailed', { error: err.message }));
      }
    });
    const del = Object.assign(document.createElement('button'), { className: 'wb-cw-delete', textContent: t('cw.delete') });
    let confirmTimer;
    del.addEventListener('click', async () => {
      if (!del.dataset.confirm) {
        del.dataset.confirm = '1';
        del.textContent = t('cw.sure');
        confirmTimer = setTimeout(() => { delete del.dataset.confirm; del.textContent = t('cw.delete'); }, 3000);
        return;
      }
      clearTimeout(confirmTimer);
      try {
        await api(`/api/cursus/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
        records.delete(s.id);
        renderList();
      } catch (err) {
        say(t('cu.deleteFailed', { error: err.message }));
      }
    });
    row.append(text, open, del);
    if (!(s.topics > 0 && s.done >= s.topics)) return row;

    // A completed course can lead on: deeper (3 specialization paths) or sideways (3 companion
    // courses). Their buttons sit in the row, left of Open; the choices unfold below it.
    const entry = Object.assign(document.createElement('div'), { className: 'wb-cu-entry' });
    const panel = Object.assign(document.createElement('div'), { className: 'wb-cu-options', hidden: true });
    for (const kind of ['specialize', 'tangent']) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: t(`cu.${kind}`), title: t(`cu.${kind}.title`) });
      button.addEventListener('click', () => {
        const again = panel.dataset.kind === kind && !panel.hidden;
        panel.hidden = again;
        if (!again) showFollowUps(s, kind, panel);
      });
      row.insertBefore(button, open);
    }
    entry.append(row, panel);
    return entry;
  }

  /** The 3 follow-up courses of kind `kind` for cursus summary `s`, each launchable, in `panel`. */
  async function showFollowUps(s, kind, panel, { refresh = false } = {}) {
    panel.dataset.kind = kind;
    panel.replaceChildren(Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t(`cu.${kind}.thinking`) }));
    try {
      const { options } = await post(`/api/cursus/${encodeURIComponent(s.id)}/followups`, { kind, refresh, model: settings().model });
      if (panel.dataset.kind !== kind) return; // the other button was clicked meanwhile
      const heading = Object.assign(document.createElement('p'), { className: 'wb-hint', textContent: t(`cu.${kind}.intro`, { title: s.title }) });
      const cards = options.map((o) => {
        const card = Object.assign(document.createElement('div'), { className: 'wb-cu-option' });
        const launch = Object.assign(document.createElement('button'), { type: 'button', className: 'primary', textContent: t('cu.launch') });
        launch.addEventListener('click', () => startCursus({
          domain: o.domain, module: o.module, totalMinutes: s.totalMinutes, topicSeconds: s.topicSeconds,
          level: s.level, parentId: s.id, relation: kind, // a specialization goes one level up (server)
        }));
        card.append(
          Object.assign(document.createElement('span'), { className: 'wb-cw-title', textContent: o.module }),
          Object.assign(document.createElement('span'), { className: 'wb-cw-meta', textContent: o.domain }),
          Object.assign(document.createElement('span'), { textContent: o.pitch }),
          ...(o.anchors.length ? [Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t('cu.anchors', { list: o.anchors.join(', ') }) })] : []),
          launch,
        );
        return card;
      });
      const more = Object.assign(document.createElement('button'), { type: 'button', className: 'wb-cu-more', textContent: t('cu.moreIdeas') });
      more.addEventListener('click', () => showFollowUps(s, kind, panel, { refresh: true }));
      panel.replaceChildren(heading, ...cards, more);
    } catch (err) {
      panel.replaceChildren(Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t('cu.followUpsFailed', { error: err.message }) }));
    }
  }

  // --- The plan ----------------------------------------------------------------------------

  function showPlan(id) {
    shown = id;
    const c = records.get(id);
    home.hidden = true;
    plan.hidden = false;
    const at = c.current && where({ id, topicId: c.current });
    if (at) openParts.add(`${id}:${at.partIndex}`); // unfold where the student is
    else if (!allParts(c).some((p, i) => openParts.has(`${id}:${i}`))) openParts.add(`${id}:0`);
    render();
    plan.scrollTop = 0;
  }

  function showHome() {
    shown = null;
    plan.hidden = true;
    home.hidden = false;
    renderList();
  }

  /** The topic to start or resume: the current one if unfinished, else the first one not done. */
  function resumeTopic(c) {
    const topics = allTopics(c);
    const current = topics.find((x) => x.id === c.current);
    if (current && !current.done) return current;
    const after = current ? topics.slice(topics.indexOf(current) + 1) : topics;
    return after.find((x) => !x.done) ?? topics.find((x) => !x.done) ?? null;
  }

  function playTopic(c, topic) {
    if (isBusy()) return say(t('cw.wait'));
    say('');
    modal.close();
    onPlayTopic(c, topic);
  }

  function render() {
    if (!modal.open || !shown) return;
    const c = records.get(shown);
    if (!c) return showHome();
    $('wb-cu-plan-title').textContent = c.title;
    $('wb-cu-plan-thread').textContent = c.parent ? `${c.thread} (${t(`cu.from.${c.parent.relation}`, { title: c.parent.title })})` : c.thread;
    const topics = allTopics(c);
    const done = topics.filter((x) => x.done).length;
    const bar = $('wb-cu-progress');
    bar.max = c.topicCount;
    bar.value = done;
    const minutes = Math.round((done * c.topicSeconds) / 60);
    $('wb-cu-progress-text').textContent = t('cu.progress', { done, n: c.topicCount, minutes, total: c.totalMinutes });

    const resume = $('wb-cu-resume');
    const target = resumeTopic(c);
    resume.hidden = !target;
    if (target) {
      const n = where({ id: c.id, topicId: target.id }).number;
      resume.textContent = t(c.current ? 'cu.resume' : 'cu.start', { n, title: target.title });
      resume.onclick = () => playTopic(c, target);
    }

    let partNumber = 0;
    $('wb-cu-acts').replaceChildren(...c.acts.map((act, a) => {
      const section = Object.assign(document.createElement('section'), { className: 'wb-cu-act' });
      section.append(
        Object.assign(document.createElement('h4'), { textContent: t('cu.act', { n: ROMAN[a] ?? a + 1, title: act.title }) }),
        Object.assign(document.createElement('p'), { className: 'wb-hint', textContent: act.summary }),
      );
      for (const part of act.parts) section.append(partView(c, part, partNumber++));
      return section;
    }));
  }

  function partView(c, part, index) {
    const key = `${c.id}:${index}`;
    const state = part.topics ? 'ready' : partState.get(key) ?? 'waiting';
    const details = Object.assign(document.createElement('details'), { className: 'wb-cu-part', open: openParts.has(key) });
    details.dataset.state = state;
    details.addEventListener('toggle', () => (details.open ? openParts.add(key) : openParts.delete(key)));

    const summary = document.createElement('summary');
    const doneCount = (part.topics ?? []).filter((x) => x.done).length;
    const status = state === 'ready' ? t('cu.partDone', { done: doneCount, n: part.topics.length })
      : state === 'loading' ? t('cu.partWriting') : state === 'error' ? t('cu.partFailed') : t('cu.partWaiting');
    summary.append(
      Object.assign(document.createElement('span'), { className: 'wb-cu-part-num', textContent: t('cu.part', { n: index + 1 }) }),
      Object.assign(document.createElement('span'), { className: 'wb-cu-part-title', textContent: part.title }),
      Object.assign(document.createElement('span'), { className: 'wb-cu-part-status', textContent: status }),
    );
    details.append(summary, Object.assign(document.createElement('p'), { className: 'wb-hint', textContent: t('cu.objective', { s: part.objective }) }));

    if (state === 'error') {
      const retry = Object.assign(document.createElement('button'), { type: 'button', textContent: t('cu.retry') });
      retry.addEventListener('click', () => { partState.delete(key); writeMissingParts(c); });
      details.append(retry);
    }
    if (part.topics) {
      const list = Object.assign(document.createElement('ol'), { className: 'wb-cu-topics', start: part.firstTopic });
      for (const topic of part.topics) {
        const item = document.createElement('li');
        const button = Object.assign(document.createElement('button'), { type: 'button', className: 'wb-cu-topic', title: t('cu.playTopic') });
        button.dataset.state = topic.done ? 'done' : topic.id === c.current ? 'current' : 'todo';
        button.append(
          Object.assign(document.createElement('span'), { className: 'wb-cu-topic-title', textContent: topic.title }),
          Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: topic.summary }),
        );
        button.addEventListener('click', () => playTopic(c, topic));
        item.append(button);
        list.append(item);
      }
      details.append(list, Object.assign(document.createElement('p'), { className: 'wb-hint', textContent: t('cu.quizNote') }));
    }
    return details;
  }

  // --- Wiring ------------------------------------------------------------------------------

  $('wb-cu-open').addEventListener('click', () => {
    say('');
    renderShape();
    renderCloud();
    if (shown && records.has(shown)) showPlan(shown);
    else showHome();
    modal.showModal();
    render();
  });
  $('wb-cu-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }); // backdrop
  $('wb-cu-back').addEventListener('click', showHome);
  $('wb-cu-form').addEventListener('submit', create);
  $('wb-cu-dice').addEventListener('click', surprise);
  fields.total.addEventListener('change', renderShape);
  fields.topic.addEventListener('input', renderShape);
  onLangChange(() => {
    renderShape();
    renderLevel();
    if (!modal.open) return;
    renderCloud();
    if (shown) render(); else renderList();
  });

  return { where, next, progress, load, get: (id) => records.get(id) ?? null, isCreating: () => creating };
}
