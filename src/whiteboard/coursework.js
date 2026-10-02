// Coursework panel: saves every lesson that gets played, and drives the "past coursework"
// modal (list / play / delete) plus export and import. Lessons go to the server's
// coursework database, or - when "Keep my lessons private" is ticked - to this browser only
// (localStorage), never leaving it.
import { t, tn, getLang, onLangChange } from '../i18n.js';

async function api(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `${url} failed (${res.status})`);
  // An HTML page instead of JSON means the server doesn't know this route: it needs a restart.
  if (body === null) throw new Error('the server did not answer with JSON (restart it: npm run dev)');
  return body;
}

const formatDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' });
};

// --- Private lessons: this browser's localStorage ------------------------------------------

const LOCAL_KEY = 'wb-coursework';
const MAX_LOCAL = 300;            // oldest dropped beyond this (or when storage is full)
const WORDS_PER_SECOND = 2.2;     // for lessons saved without their measured duration

/** Whether lessons stay in this browser ("Keep my lessons private"). */
export const isPrivate = () => Boolean(document.getElementById('wb-cw-private')?.checked);

function readLocal() {
  try {
    const db = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null');
    return Array.isArray(db?.lessons) ? db.lessons : [];
  } catch {
    return [];
  }
}

/** Saves the local lessons, dropping the oldest ones if the browser's storage is full. */
function writeLocal(lessons) {
  lessons = lessons.slice(-MAX_LOCAL);
  for (;;) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: 1, lessons }));
      return;
    } catch (err) {
      if (lessons.length <= 1) throw err;
      lessons = lessons.slice(Math.ceil(lessons.length / 10)); // full: forget the oldest 10%
    }
  }
}

const summaryOf = ({ id, title, subject, difficulty, lang, createdAt, playedAt, spec }) =>
  ({ id, title, subject, difficulty, lang, createdAt, playedAt, steps: spec?.steps?.length ?? 0 });

/** A lesson saved in this browser, or null. */
export const getLocalLesson = (id) => readLocal().find((l) => l.id === id) ?? null;

/** A saved lesson: from this browser first, then (unless private) from the server. */
export async function getLesson(id) {
  const local = getLocalLesson(id);
  if (local) return local;
  if (isPrivate()) throw new Error('lesson not found in this browser');
  return api(`/api/coursework/${encodeURIComponent(id)}`);
}

/** "12 lessons · 3 h 47 min of lessons · 2 cursus · 6.2 MB": everything saved, or '' if unknown. */
export async function statsText() {
  try {
    const priv = isPrivate();
    let s;
    if (priv) { // this browser's lessons; the cursus count still comes from the server
      const lessons = readLocal();
      const seconds = lessons.reduce((sum, l) => sum + (l.duration
        ?? l.narration.reduce((n, seg) => n + String(seg.text).split(/\s+/).filter(Boolean).length, 0) / WORDS_PER_SECOND), 0);
      const cursus = await api('/api/coursework/stats').then((r) => r.cursus, () => 0);
      s = { lessons: lessons.length, seconds: Math.round(seconds), cursus, bytes: (localStorage.getItem(LOCAL_KEY) ?? '').length * 2 }; // UTF-16
    } else {
      s = await api('/api/coursework/stats');
    }
    const h = Math.floor(s.seconds / 3600), m = Math.round((s.seconds % 3600) / 60);
    const duration = h ? t('dur.hm', { h, m: String(m).padStart(2, '0') }) : t('dur.m', { m });
    const lang = getLang();
    const size = s.bytes < 1e6
      ? t('size.kb', { n: Math.max(s.bytes ? 1 : 0, Math.round(s.bytes / 1e3)).toLocaleString(lang) })
      : t('size.mb', { n: (s.bytes / 1e6).toLocaleString(lang, { maximumFractionDigits: 1 }) });
    return t(priv ? 'stats.linePrivate' : 'stats.line', { lessons: tn('stats.lessons', s.lessons), duration, cursus: tn('stats.cursus', s.cursus), size });
  } catch {
    return '';
  }
}

/**
 * `onPlay(lesson)` plays a full lesson record fetched from the database;
 * `isBusy()` says whether a generation is running and playing now would clash.
 * Returns { save(lesson) }.
 */
export function createCoursework({ onPlay, isBusy }) {
  const $ = (id) => document.getElementById(id);
  const modal = $('wb-cw-modal');
  const list = $('wb-cw-list');
  const messages = [$('wb-cw-message'), $('wb-cw-modal-message')]; // panel and modal
  const fileInput = $('wb-cw-file');

  function say(text) {
    for (const el of messages) {
      el.textContent = text;
      el.hidden = !text;
    }
  }

  // The same operations on either store.
  const store = {
    async list() {
      if (!isPrivate()) return (await api('/api/coursework')).lessons;
      return readLocal().map(summaryOf).sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    },
    async remove(id) {
      if (!isPrivate()) return api(`/api/coursework/${encodeURIComponent(id)}`, { method: 'DELETE' });
      writeLocal(readLocal().filter((l) => l.id !== id));
    },
  };

  /** Stores (or updates) a lesson. Failing to save must never interrupt the lesson. */
  async function save({ id, title, subject, difficulty, lang, createdAt, narration, spec, duration, cursusId, topicId }) {
    const record = { id, title, subject, difficulty, lang, createdAt, narration, spec, duration, cursusId, topicId };
    try {
      if (isPrivate()) {
        const lessons = readLocal();
        const i = lessons.findIndex((l) => l.id === id);
        const kept = { ...record, createdAt: i >= 0 ? lessons[i].createdAt : createdAt, playedAt: new Date().toISOString() };
        if (i >= 0) lessons.splice(i, 1);
        lessons.push(kept); // most recently played last
        writeLocal(lessons);
      } else {
        await api('/api/coursework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
      }
      if (modal.open) await render();
    } catch (err) {
      console.warn('[coursework] could not save the lesson:', err.message);
    }
  }

  function item(summary) {
    const row = Object.assign(document.createElement('div'), { className: 'wb-cw-item' });
    const text = Object.assign(document.createElement('div'), { className: 'wb-cw-text' });
    const difficulty = summary.difficulty ? t(`diff.${summary.difficulty}`) : '';
    const language = summary.lang ? summary.lang.toUpperCase() : ''; // the language it was taught in
    const meta = [language, difficulty, tn('cw.steps', summary.steps), formatDate(summary.playedAt)].filter(Boolean).join(' · ');
    const title = t('quote', { s: summary.title });
    text.append(
      Object.assign(document.createElement('span'), { className: 'wb-cw-title', textContent: summary.title }),
      Object.assign(document.createElement('span'), { className: 'wb-cw-meta', textContent: meta }),
    );

    const play = Object.assign(document.createElement('button'), { textContent: t('btn.play') });
    play.addEventListener('click', async () => {
      if (isBusy()) return say(t('cw.wait'));
      try {
        const lesson = await getLesson(summary.id);
        modal.close();
        onPlay(lesson);
      } catch (err) {
        say(t('cw.openFailed', { title, error: err.message }));
      }
    });

    // Deleting asks twice: the first click turns the button into "Sure?".
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
        await store.remove(summary.id);
        await render();
      } catch (err) {
        say(t('cw.deleteFailed', { title, error: err.message }));
      }
    });

    row.append(text, play, del);
    return row;
  }

  async function render() {
    statsText().then((text) => { $('wb-cw-stats').textContent = text; });
    try {
      const lessons = await store.list();
      $('wb-cw-title').textContent = t(isPrivate() ? 'cw.titlePrivate' : 'cw.titleCount', { n: lessons.length });
      list.replaceChildren(...(lessons.length
        ? lessons.map(item)
        : [Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t('cw.empty') })]));
    } catch (err) {
      list.replaceChildren(Object.assign(document.createElement('span'), { className: 'wb-hint', textContent: t('cw.loadFailed', { error: err.message }) }));
    }
  }

  /** Merges an exported file into this browser's lessons (each spec is validated: the board draws it). */
  async function importLocal(text) {
    let file;
    try { file = JSON.parse(text); } catch { throw new Error('not a JSON file'); }
    if (!Array.isArray(file?.lessons)) throw new Error('not a coursework file (no "lessons" list)');
    const { validateSpec } = await import('./validate.js'); // loaded only when importing
    const lessons = readLocal();
    const known = new Set(lessons.map((l) => l.id));
    const result = { added: 0, skipped: 0, invalid: 0 };
    for (const raw of file.lessons) {
      const narration = Array.isArray(raw?.narration) ? raw.narration.map((s) => ({ id: String(s?.id ?? ''), text: String(s?.text ?? '') })) : [];
      if (!raw?.id || !raw.spec || validateSpec(raw.spec, { cues: narration.map((s) => s.id) }).errors.length) { result.invalid++; continue; }
      if (known.has(raw.id)) { result.skipped++; continue; }
      known.add(raw.id);
      lessons.push({ ...raw, narration, playedAt: raw.playedAt || new Date().toISOString() });
      result.added++;
    }
    writeLocal(lessons);
    return result;
  }

  async function importFile(file) {
    try {
      const result = isPrivate()
        ? await importLocal(await file.text())
        : await api('/api/coursework/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await file.text(), // the server rejects anything that isn't a coursework file
        });
      const notes = [];
      if (result.skipped) notes.push(t('cw.skipped', { n: result.skipped }));
      if (result.invalid) notes.push(t('cw.invalid', { n: result.invalid }));
      say(tn('cw.imported', result.added, { notes: notes.length ? ` (${notes.join(', ')})` : '' }));
      if (modal.open) await render();
    } catch (err) {
      say(t('cw.importFailed', { error: err.message }));
    }
  }

  function exportFile() {
    const a = document.createElement('a');
    if (isPrivate()) {
      const blob = new Blob([JSON.stringify({ version: 1, lessons: readLocal(), exportedAt: new Date().toISOString() }, null, 1)], { type: 'application/json' });
      a.href = URL.createObjectURL(blob);
      a.download = `coursework-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } else {
      Object.assign(a, { href: '/api/coursework/export', download: '' }).click();
    }
  }

  $('wb-cw-show').addEventListener('click', async () => {
    say('');
    await render();
    modal.showModal();
  });
  $('wb-cw-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }); // click on the backdrop
  $('wb-cw-export').addEventListener('click', () => {
    say('');
    exportFile();
  });
  $('wb-cw-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    fileInput.value = ''; // the same file can be chosen again
    if (file) await importFile(file);
  });
  $('wb-cw-private').addEventListener('change', () => {
    say(t(isPrivate() ? 'cw.nowPrivate' : 'cw.nowShared'));
    if (modal.open) render();
  });
  onLangChange(() => {
    say('');
    if (modal.open) render();
  });

  return { save };
}
