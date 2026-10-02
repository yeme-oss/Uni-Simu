// What's drawn at a point of the board: used by the right-click / long-press "Explain"
// menu. Works on expanded steps (primitives in board units). Pure: no DOM.
import { textBox } from './layout.js';
import { parsePath } from './geometry.js';
import { DEFAULT_TEXT_SIZE } from './constants.js';

const PAD = 8;          // how forgiving a click on text or a formula is
const NEAR_STROKE = 14; // how far from a line / outline still counts as on it
const LABEL_RANGE = 90; // how far a label may be to name a part of a diagram

const boxOf = (p) => {
  if (p.type === 'math' && p.box) return { left: p.box.left, right: p.box.left + p.box.width, top: p.box.top, bottom: p.box.top + p.box.height };
  if (p.type === 'text') return textBox({ size: DEFAULT_TEXT_SIZE, align: 'left', ...p });
  return null;
};
const inBox = (b, x, y, pad = PAD) => x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad;
const boxDistance = (b, x, y) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

function segmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Distance from (x, y) to a shape primitive's ink (0 inside a filled or closed shape). */
function shapeDistance(p, x, y) {
  switch (p.type) {
    case 'line':
    case 'arrow':
      return segmentDistance(x, y, p.x1, p.y1, p.x2, p.y2);
    case 'rect': {
      const inside = x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
      return inside ? 0 : boxDistance({ left: p.x, right: p.x + p.w, top: p.y, bottom: p.y + p.h }, x, y);
    }
    case 'circle':
      return Math.max(0, Math.hypot(x - p.cx, y - p.cy) - p.r);
    case 'path': {
      let best = Infinity, prev = null;
      for (const { cmd, points } of parsePath(p.d)) {
        const end = points.at(-1);
        if (prev && cmd !== 'M') best = Math.min(best, segmentDistance(x, y, prev[0], prev[1], end[0], end[1]));
        prev = end;
      }
      return best;
    }
    default:
      return Infinity;
  }
}

/**
 * The element at (x, y) among the primitives of the steps drawn so far (steps[0..upTo]).
 * Text and formulas under the point win (the smallest one); otherwise the nearest shape
 * within reach, named by the closest label. Returns null when nothing is there, or
 * { kind: 'math' | 'text' | 'part', value, step }: `value` is the LaTeX, the text, or the
 * label of the part (null if no label is near).
 */
export function elementAt(steps, upTo, x, y) {
  const drawn = steps.slice(0, upTo + 1).flatMap((s, step) => s.primitives.map((p) => ({ p, step })));
  const written = drawn.map((d) => ({ ...d, box: boxOf(d.p) })).filter((d) => d.box);

  const under = written.filter((d) => inBox(d.box, x, y))
    .sort((a, b) => (a.box.right - a.box.left) * (a.box.bottom - a.box.top) - (b.box.right - b.box.left) * (b.box.bottom - b.box.top));
  if (under.length) {
    const { p, step } = under[0];
    return p.type === 'math' ? { kind: 'math', value: p.tex, step } : { kind: 'text', value: String(p.text), step };
  }

  let hit = null;
  for (const d of drawn) {
    const dist = shapeDistance(d.p, x, y);
    if (dist <= Math.max(NEAR_STROKE, (d.p.width ?? 0) * 2) && (!hit || dist < hit.dist)) hit = { ...d, dist };
  }
  if (!hit) return null;
  // Name it after the closest real label: not a base letter (A, T…) or a 5′ / 3′ mark.
  const label = written
    .filter((d) => !/^(base-|label-[35]$)/.test(d.p.role ?? ''))
    .map((d) => ({ d, dist: boxDistance(d.box, x, y) }))
    .filter((c) => c.dist <= LABEL_RANGE)
    .sort((a, b) => a.dist - b.dist)[0]?.d.p;
  return { kind: 'part', value: label ? String(label.type === 'math' ? label.tex : label.text) : null, step: hit.step };
}
