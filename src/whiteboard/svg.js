// Debug export: the same draw operations as an SVG string (tests, 2D fallback). Pure.
import { BOARD_WIDTH, BOARD_HEIGHT, FONT_FAMILY } from './constants.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };

export function opToSVG(op) {
  if (op.kind === 'glyphs') return `<path d="${op.d}" fill="${op.color}"/>`;
  if (op.kind === 'text') {
    return `<text x="${op.x}" y="${op.y}" font-size="${op.size}" fill="${op.color}" text-anchor="${ANCHOR[op.align]}" dominant-baseline="central">${esc(op.text)}</text>`;
  }
  return `<path d="${op.d}" stroke="${op.color}" stroke-width="${op.width}" fill="${op.fill ?? 'none'}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** SVG document for a list of draw ops (e.g. all ops of all steps up to n). */
export function toSVG(ops, { width = BOARD_WIDTH, height = BOARD_HEIGHT, background = '#f4f4f0' } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT_FAMILY}, 'Comic Sans MS', sans-serif">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    ...ops.map(opToSVG),
    '</svg>',
  ].join('\n');
}
