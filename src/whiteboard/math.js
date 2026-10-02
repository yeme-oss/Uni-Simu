// LaTeX formulas as vector outlines (MathJax 4, SVG output, no DOM needed), so they can be
// drawn on the whiteboard canvas, exported to SVG, measured by the layout lint and
// validated on the server. Works in Node and in the browser.
//
// MathJax loads some font ranges (e.g. \mathbb) on demand, which is asynchronous. They are
// loaded once below (top-level await); after that every conversion is synchronous and cached.
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import { parsePath } from './geometry.js';

// Extra font ranges worth having on a lecture whiteboard: 𝔸 double-struck (\mathbb),
// 𝒜 calligraphic (\mathcal), 𝔄 fraktur (\mathfrak), and accented Latin letters so French
// words work in formulas: \text{énergie} (latin + symbols, which has « »), é in math
// (latin-i). Bold accented letters (latin-b) are left out to keep the download small.
//
// They are imported statically, through the same package path MathJax uses for its font:
// that way there is one copy of the font everywhere (Node, Vite's dev pre-bundling, the
// build). Loading them on demand from other URLs gave the browser a second copy, which
// the glyphs registered on, so \mathbb failed there even though the server accepted it.
import '@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js';
import '@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js';
import '@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js';
import '@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js';
import '@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js';
import '@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js';

const BUNDLED = ['double-struck', 'calligraphic', 'fraktur', 'latin', 'latin-i', 'symbols'];
const EXTRA_RANGES = {
  'double-struck': String.raw`\mathbb{R}`,
  calligraphic: String.raw`\mathcal{L}`,
  fraktur: String.raw`\mathfrak{g}`,
  latin: String.raw`\text{éàçœ«»ÉÀÇ}`,
  'latin-i': String.raw`é`,
};
// MathJax still "loads" a range before using it: the bundled ones are already there.
// Any other range never loads: the formula needing it fails synchronously (and is
// rejected with a clear message). Not a rejected promise: nobody would catch it, and an
// unhandled rejection stops the Node server.
mathjax.asyncLoad = (name) => {
  const range = name.split('/').pop().replace(/\.js$/, '');
  return BUNDLED.includes(range) ? Promise.resolve() : new Promise(() => {});
};

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams'], formatError: (jax, err) => { throw err; } }),
  OutputJax: new SVG({ fontCache: 'none' }),
});

// Warm-up: one small formula per extra range makes MathJax load it now.
await Promise.all(Object.entries(EXTRA_RANGES).map(([range, tex]) =>
  mathjax.handleRetriesFor(() => doc.convert(tex, { display: true })).catch((err) => {
    console.warn(`[math] font range "${range}" could not be loaded; formulas using it will be rejected:`, err.message);
  })));

const cache = new Map(); // tex -> { d, width, height } | { error }

/**
 * Renders LaTeX (no $ delimiters) to one fill path in em/1000 units, origin at the top-left
 * of the formula's box (y down). Returns { d, width, height } or { error: 'readable message' }.
 */
export function renderMath(tex) {
  const key = String(tex);
  if (!cache.has(key)) cache.set(key, convert(key));
  return cache.get(key);
}

function convert(tex) {
  let node;
  try {
    node = doc.convert(tex, { display: true });
  } catch (err) {
    // Don't let this make the model drop accents: words belong in a text element anyway.
    if (err.retry) return { error: 'uses a character not available in formulas (e.g. bold accented letters); put the words in a separate "text" element (accents are fine there) and keep only the mathematics in "tex"' };
    return { error: `LaTeX error: ${err.message}` };
  }
  const svg = adaptor.childNodes(node).find((n) => adaptor.kind(n) === 'svg');
  const [vx, vy, vw, vh] = String(adaptor.getAttribute(svg, 'viewBox')).split(/\s+/).map(Number);
  const parts = [];
  walk(svg, [1, 0, 0, 1, -vx, -vy], parts); // shift the viewBox origin to (0, 0)
  if (!parts.length) return { error: 'LaTeX produced nothing to draw' };
  return { d: parts.join(' '), width: vw, height: vh };
}

// 2D affine matrices as [a, b, c, d, e, f] (SVG convention).
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(value) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of String(value ?? '').matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === 'translate') m = multiply(m, [1, 0, 0, 1, a[0], a[1] ?? 0]);
    else if (fn === 'scale') m = multiply(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0]);
    else if (fn === 'matrix') m = multiply(m, a);
    else if (fn === 'rotate') {
      const r = (a[0] * Math.PI) / 180;
      m = multiply(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
    }
  }
  return m;
}

const num = (v) => Math.round(v * 10) / 10;
const pt = (p) => `${num(p[0])} ${num(p[1])}`;

/** Collects every glyph outline and rule (as absolute path data) under `node`. */
function walk(node, parent, out) {
  const kind = adaptor.kind(node);
  if (kind === '#text' || kind === '#comment') return;
  let m = multiply(parent, parseTransform(adaptor.getAttribute(node, 'transform')));
  if (kind === 'svg') { // nested <svg> boxes are positioned by x / y
    const x = Number(adaptor.getAttribute(node, 'x') ?? 0) || 0;
    const y = Number(adaptor.getAttribute(node, 'y') ?? 0) || 0;
    if (x || y) m = multiply(m, [1, 0, 0, 1, x, y]);
  }
  if (kind === 'path') {
    const d = adaptor.getAttribute(node, 'd');
    if (d) out.push(transformPath(d, m));
  } else if (kind === 'rect') {
    const x = Number(adaptor.getAttribute(node, 'x') ?? 0), y = Number(adaptor.getAttribute(node, 'y') ?? 0);
    const w = Number(adaptor.getAttribute(node, 'width') ?? 0), h = Number(adaptor.getAttribute(node, 'height') ?? 0);
    if (w > 0 && h > 0) {
      const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => apply(m, p));
      out.push(`M ${pt(c[0])} L ${pt(c[1])} L ${pt(c[2])} L ${pt(c[3])} Z`);
    }
  }
  for (const child of adaptor.childNodes(node) ?? []) walk(child, m, out);
}

function transformPath(d, m) {
  return parsePath(d).map(({ cmd, points }) => {
    if (cmd === 'Z') return 'Z';
    return `${cmd} ${points.map((p) => pt(apply(m, p))).join(' ')}`;
  }).join(' ');
}

/**
 * Places a formula on the board: `size` is its font size in board units (like text),
 * (x, y) its anchor per `align`, at the vertical middle. Returns
 * { d, box: { left, top, width, height } } in board units, or { error }.
 */
export function layoutMath({ tex, x, y, size = 26, align = 'left' }) {
  const r = renderMath(tex);
  if (r.error) return r;
  const k = size / 1000; // MathJax units: 1 em = 1000
  const width = r.width * k, height = r.height * k;
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const top = y - height / 2;
  const d = parsePath(r.d).map(({ cmd, points }) => (cmd === 'Z' ? 'Z'
    : `${cmd} ${points.map(([px, py]) => pt([left + px * k, top + py * k])).join(' ')}`)).join(' ');
  return { d, box: { left, top, width, height } };
}
