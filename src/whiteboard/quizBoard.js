// End-of-demo quiz drawn on a canvas (shown on the left board): one question per row with
// its 3 options, a page at a time (◀ 1 / 4 ▶). Clicking an option answers the question:
// green if right, red if wrong (and the right one in green). main.js puts the canvas on
// the board and forwards clicks; this module only draws and handles clicks in canvas pixels.
import { t, onLangChange } from '../i18n.js';

export const QUIZ_PER_PAGE = 5;

const COLORS = {
  background: '#fbfbf8', text: '#1d1d1f', muted: '#6b6b6b', line: '#c9c9c4',
  right: '#23803a', rightFill: '#dcf2e2', wrong: '#c22f2f', wrongFill: '#fbe1e1', accent: '#1d4fb5',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * `aspect`: width / height of the board it is shown on. `onChange()` is called after every
 * redraw (so the texture can be uploaded).
 */
export function createQuizBoard({ aspect, onChange = () => {} }) {
  const W = 2048, H = Math.round(W / aspect);
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  let quiz = null;       // { title, questions: [{ question, options, answer }], picks: [index|null], page }
  let status = 'hidden'; // 'hidden' | 'loading' | 'ready' | 'error'
  let title = '';
  let hits = [];         // clickable areas of the current drawing: { x, y, w, h, action }
  let tips = [];         // areas whose text may be cut on the board: { x, y, w, h, text } (full text on hover)

  const pages = () => Math.max(1, Math.ceil((quiz?.questions.length ?? 0) / QUIZ_PER_PAGE));

  /** Draws `text` in the box, shrinking it a little then ellipsing it to fit `maxWidth`. */
  function fitText(text, x, y, maxWidth, size, weight = 400) {
    let s = size;
    ctx.font = `${weight} ${s}px ${FONT}`;
    while (ctx.measureText(text).width > maxWidth && s > size * 0.78) {
      s -= 1;
      ctx.font = `${weight} ${s}px ${FONT}`;
    }
    let out = text;
    while (ctx.measureText(out).width > maxWidth && out.length > 1) out = `${out.slice(0, -2)}…`;
    ctx.fillText(out, x, y);
  }

  function roundRect(x, y, w, h, r, fill, stroke, lineWidth = 3) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function render() {
    hits = [];
    tips = [];
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, W, H);
    if (status === 'hidden') return onChange();
    const M = 70;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Header: "Quiz — title", score on the right.
    ctx.fillStyle = COLORS.text;
    const answered = quiz ? quiz.picks.filter((p) => p !== null).length : 0;
    const score = quiz && answered ? t('quiz.score', { ok: quiz.picks.filter((p, i) => p === quiz.questions[i].answer).length, n: quiz.questions.length }) : '';
    ctx.font = `600 40px ${FONT}`;
    const scoreWidth = score ? ctx.measureText(score).width + 30 : 0;
    fitText(`${t('quiz.title')} — ${title}`, M, 90, W - 2 * M - scoreWidth, 58, 700);
    if (score) {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.accent;
      ctx.font = `600 40px ${FONT}`;
      ctx.fillText(score, W - M, 90);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(M, 140, W - 2 * M, 3);

    if (status !== 'ready') {
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.font = `400 52px ${FONT}`;
      ctx.fillText(t(status === 'error' ? 'quiz.error' : 'quiz.loading'), W / 2, H / 2);
      return onChange();
    }

    // One row per question: the question, then its 3 options side by side.
    const footer = pages() > 1 ? 120 : 40;
    const top = 170, rowH = (H - top - footer) / QUIZ_PER_PAGE;
    const first = quiz.page * QUIZ_PER_PAGE;
    quiz.questions.slice(first, first + QUIZ_PER_PAGE).forEach((q, k) => {
      const i = first + k;
      const y = top + k * rowH;
      const pick = quiz.picks[i];
      ctx.fillStyle = COLORS.text;
      fitText(`${i + 1}. ${q.question}`, M, y + rowH * 0.28, W - 2 * M, 46, 600);
      tips.push({ x: M, y: y + rowH * 0.28 - 30, w: W - 2 * M, h: 60, text: `${i + 1}. ${q.question}` });
      const gap = 24, optW = (W - 2 * M - 2 * gap) / 3, optH = Math.min(70, rowH * 0.4), optY = y + rowH * 0.5;
      q.options.forEach((option, o) => {
        const x = M + o * (optW + gap);
        let fill = null, stroke = COLORS.line, color = COLORS.text;
        if (pick !== null) {
          if (o === q.answer) { fill = COLORS.rightFill; stroke = COLORS.right; }
          else if (o === pick) { fill = COLORS.wrongFill; stroke = COLORS.wrong; }
          else color = COLORS.muted;
        }
        roundRect(x, optY, optW, optH, 14, fill, stroke);
        ctx.fillStyle = color;
        fitText(`${'ABC'[o]}   ${option}`, x + 22, optY + optH / 2, optW - 44, 36, 500);
        tips.push({ x, y: optY, w: optW, h: optH, text: `${'ABC'[o]}. ${option}` });
        if (pick === null) hits.push({ x, y: optY, w: optW, h: optH, action: () => { quiz.picks[i] = o; } });
      });
    });

    // Pagination.
    if (pages() > 1) {
      const y = H - 62;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.text;
      ctx.font = `600 44px ${FONT}`;
      ctx.fillText(t('quiz.page', { i: quiz.page + 1, n: pages() }), W / 2, y);
      const arrow = (label, x, enabled, action) => {
        roundRect(x - 60, y - 38, 120, 76, 16, enabled ? '#ffffff' : null, enabled ? COLORS.line : '#e6e6e2');
        ctx.fillStyle = enabled ? COLORS.text : '#c9c9c4';
        ctx.font = `700 44px ${FONT}`;
        ctx.fillText(label, x, y + 2);
        if (enabled) hits.push({ x: x - 60, y: y - 38, w: 120, h: 76, action });
      };
      arrow('◀', W / 2 - 220, quiz.page > 0, () => { quiz.page -= 1; });
      arrow('▶', W / 2 + 220, quiz.page < pages() - 1, () => { quiz.page += 1; });
    }
    onChange();
  }

  onLangChange(render); // labels follow the interface language (the questions keep theirs)

  return {
    canvas,
    get visible() { return status !== 'hidden'; },
    /** Waiting for the quiz of the lesson `lessonTitle`. */
    showLoading(lessonTitle) { title = lessonTitle; quiz = null; status = 'loading'; render(); },
    show(lessonTitle, questions) {
      title = lessonTitle;
      quiz = { questions, picks: questions.map(() => null), page: 0 };
      status = questions.length ? 'ready' : 'error';
      render();
    },
    showError(lessonTitle) { title = lessonTitle; status = 'error'; render(); },
    hide() { status = 'hidden'; quiz = null; render(); },
    /** A click at canvas pixel (x, y): answers or turns the page. Returns true if it did something. */
    click(x, y) {
      const hit = hits.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (!hit) return false;
      hit.action();
      render();
      return true;
    },
    /** Full text of the question or option at (x, y) (it may be shortened on the board), or null. */
    tipAt(x, y) { return tips.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h)?.text ?? null; },
    /** Whether (x, y) is on something clickable (for the pointer cursor). */
    isClickable(x, y) { return hits.some((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h); },
  };
}

