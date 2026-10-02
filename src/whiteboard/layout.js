// Layout lint on expanded steps: catches the visible defects LLM layouts tend to
// have (overlapping labels, text off the board, text spilling out of its shape).
// Formulas count as text, with their real measured box.
// Messages are fed back to the LLM for repair. Pure: no DOM.
import { BOARD_WIDTH, BOARD_HEIGHT } from './constants.js';

const CHAR_WIDTH = 0.45; // Patrick Hand average advance, in em
const MARGIN = 4;

/** Estimated box of a text primitive ({ left, right, top, bottom }, board units). */
export function textBox(p) {
  const w = String(p.text).length * p.size * CHAR_WIDTH;
  const h = p.size;
  const left = p.align === 'center' ? p.x - w / 2 : p.align === 'right' ? p.x - w : p.x;
  return { left, right: left + w, top: p.y - h / 2, bottom: p.y + h / 2 };
}

const overlap = (a, b) => a.left < b.right - MARGIN && b.left < a.right - MARGIN && a.top < b.bottom - MARGIN && b.top < a.bottom - MARGIN;

/**
 * @param steps expanded steps: [{ primitives, authored }] where `authored` are the
 *              step's own elements (components are trusted for their internal layout).
 * @returns string[] problems, e.g. 'steps[2]: text "Citrate (6C)" overflows its circle'
 */
export function lintLayout(steps) {
  const problems = [];
  const texts = [];   // { step, p, box, own, label }
  const shapes = [];  // authored circles and rects

  steps.forEach((step, s) => {
    for (const p of step.primitives) {
      const own = !p.role; // component primitives carry a role
      if (p.type === 'text') texts.push({ step: s, p, box: textBox({ size: 22, align: 'left', ...p }), own, label: `text "${p.text}"` });
      if (p.type === 'math' && p.box) {
        const { left, top, width, height } = p.box;
        texts.push({ step: s, p, box: { left, right: left + width, top, bottom: top + height }, own, label: `formula "${p.tex}"` });
      }
      if (own && (p.type === 'circle' || p.type === 'rect')) shapes.push({ step: s, p });
    }
  });

  for (const t of texts) {
    if (!t.own) continue;
    const { box } = t;
    if (box.left < 0 || box.right > BOARD_WIDTH || box.top < 0 || box.bottom > BOARD_HEIGHT) {
      problems.push(`steps[${t.step}]: ${t.label} goes outside the 1000x560 board`);
    }
    // Text whose anchor sits inside a shape must fit inside it.
    for (const { p: sh } of shapes) {
      if (sh.type === 'circle') {
        const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
        if (Math.hypot(cx - sh.cx, cy - sh.cy) >= sh.r) continue;
        const reach = Math.max(...[[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]]
          .map(([x, y]) => Math.hypot(x - sh.cx, y - sh.cy)));
        if (reach > sh.r + MARGIN) problems.push(`steps[${t.step}]: ${t.label} overflows its circle (needs radius >= ${Math.ceil(reach + 6)} or a smaller/shorter text)`);
      } else {
        // "Inside": a text's anchor, or a formula's centre, lies in the rect.
        const ax = t.p.type === 'math' ? (box.left + box.right) / 2 : t.p.x;
        const ay = t.p.type === 'math' ? (box.top + box.bottom) / 2 : t.p.y;
        const inside = ax > sh.x && ax < sh.x + sh.w && ay > sh.y && ay < sh.y + sh.h;
        if (inside && (box.left < sh.x - MARGIN || box.right > sh.x + sh.w + MARGIN || box.top < sh.y - MARGIN || box.bottom > sh.y + sh.h + MARGIN)) {
          problems.push(`steps[${t.step}]: ${t.label} overflows its rect (it is about ${Math.round(box.right - box.left)} wide)`);
        }
      }
    }
  }

  // Overlapping texts (at least one written by the author, not a component).
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (!(a.own || b.own) || !overlap(a.box, b.box)) continue;
      problems.push(`texts overlap: ${a.label} (steps[${a.step}]) and ${b.label} (steps[${b.step}])${a.own && b.own ? '' : ' — the component already draws its own labels; move or drop yours'}`);
    }
  }
  return problems;
}
