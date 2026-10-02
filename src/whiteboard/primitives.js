// Primitives -> draw operations. Everything the animator draws is one of:
//   { kind: 'stroke', d, length, color, width, fill? }   (SVG path data)
//   { kind: 'text', text, x, y, size, color, align }
//   { kind: 'glyphs', d, box, size, color, text }        (a formula: filled outlines)
// Pure: no DOM.
import { pathLength } from './geometry.js';
import { inkColor, DEFAULT_STROKE_WIDTH, DEFAULT_TEXT_SIZE } from './constants.js';

const ARROW_HEAD_ANGLE = (28 * Math.PI) / 180;
const r2 = (n) => Math.round(n * 100) / 100;

/** Arrowhead size for a stroke width. */
export const arrowHeadSize = (width) => 12 + width * 2;

/** The two barbs of an arrowhead pointing from (x1,y1) to the tip (x2,y2), as path data. */
export function arrowHeadPath(x1, y1, x2, y2, size) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const b1 = [x2 - size * Math.cos(a - ARROW_HEAD_ANGLE), y2 - size * Math.sin(a - ARROW_HEAD_ANGLE)];
  const b2 = [x2 - size * Math.cos(a + ARROW_HEAD_ANGLE), y2 - size * Math.sin(a + ARROW_HEAD_ANGLE)];
  return `M ${r2(b1[0])} ${r2(b1[1])} L ${r2(x2)} ${r2(y2)} L ${r2(b2[0])} ${r2(b2[1])}`;
}

function stroke(p, d, length = pathLength(d)) {
  const op = { kind: 'stroke', d, length, color: inkColor(p.color), width: p.width ?? DEFAULT_STROKE_WIDTH };
  if (p.fill) op.fill = inkColor(p.fill);
  if (p.role) op.role = p.role;
  return op;
}

/** Converts one primitive element into draw operations (in drawing order). */
export function toDrawOps(p) {
  switch (p.type) {
    case 'line':
      return [stroke(p, `M ${r2(p.x1)} ${r2(p.y1)} L ${r2(p.x2)} ${r2(p.y2)}`)];
    case 'arrow': {
      const width = p.width ?? DEFAULT_STROKE_WIDTH;
      const shaft = stroke(p, `M ${r2(p.x1)} ${r2(p.y1)} L ${r2(p.x2)} ${r2(p.y2)}`);
      const head = stroke(p, arrowHeadPath(p.x1, p.y1, p.x2, p.y2, p.head ?? arrowHeadSize(width)));
      return [shaft, head];
    }
    case 'rect':
      return [stroke(p, `M ${r2(p.x)} ${r2(p.y)} h ${r2(p.w)} v ${r2(p.h)} h ${r2(-p.w)} Z`)];
    case 'circle': {
      const { cx, cy, r } = p;
      // Arcs aren't accepted in spec paths, but Path2D draws them; length is exact.
      const d = `M ${r2(cx + r)} ${r2(cy)} A ${r2(r)} ${r2(r)} 0 1 1 ${r2(cx - r)} ${r2(cy)} A ${r2(r)} ${r2(r)} 0 1 1 ${r2(cx + r)} ${r2(cy)}`;
      return [stroke(p, d, 2 * Math.PI * r)];
    }
    case 'path':
      return [stroke(p, p.d)];
    case 'text': {
      const op = {
        kind: 'text',
        text: String(p.text),
        x: p.x,
        y: p.y,
        size: p.size ?? DEFAULT_TEXT_SIZE,
        color: inkColor(p.color),
        align: p.align ?? 'left',
      };
      if (p.role) op.role = p.role;
      return [op];
    }
    case 'math': // laid out by expand.js (d + box already in board units)
      return [{ kind: 'glyphs', d: p.d, box: p.box, size: p.size ?? DEFAULT_TEXT_SIZE, color: inkColor(p.color), text: String(p.tex) }];
    default:
      throw new Error(`unknown primitive type "${p.type}"`);
  }
}

/** Rough text width in logical units (the marker font is ~0.5 em per character). */
export const estimateTextWidth = (text, size) => String(text).length * size * 0.5;
