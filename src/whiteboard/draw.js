// Drawing helpers for hand-made whiteboard lessons (the free lectures): small functions that
// return whiteboard spec elements (or arrays of them) in board units (1000 x 560, y down).
// Pure data, no DOM: every output is checked by the schema like any other spec.
//
// Conventions: colours are the board's names ('black', 'blue', 'red', 'green', 'orange',
// 'purple') or '#rrggbb'; text sizes are 18 or more (legible from the seats); helpers that
// return several elements return an array - spread it into a step's `draw` list.

// --- Primitives ----------------------------------------------------------------------------

export const r1 = (v) => Math.round(v * 10) / 10;
export const T = (x, y, text, size = 22, extra = {}) => ({ type: 'text', x, y, text, size, ...extra });
export const M = (x, y, tex, size = 26, extra = {}) => ({ type: 'math', x, y, tex, size, ...extra });
export const line = (x1, y1, x2, y2, color = 'black', width = 3) => ({ type: 'line', x1, y1, x2, y2, color, width });
export const arrow = (x1, y1, x2, y2, color = 'black', width = 3) => ({ type: 'arrow', x1, y1, x2, y2, color, width });
export const circle = (cx, cy, r, color = 'black', fill, width = 3) => ({ type: 'circle', cx, cy, r, color, width, ...(fill && { fill }) });
export const rect = (x, y, w, h, color = 'black', fill, width = 3) => ({ type: 'rect', x, y, w, h, color, width, ...(fill && { fill }) });
export const path = (d, color = 'black', width = 3, fill) => ({ type: 'path', d, color, width, ...(fill && { fill }) });

/** The slide's title, top left. */
export const heading = (text) => T(40, 40, text, 32);

/** Path data through points [[x, y], ...] (straight segments), optionally closed. */
export const polyline = (pts, close = false) => `${pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${r1(x)} ${r1(y)}`).join(' ')}${close ? ' Z' : ''}`;

// --- Lines and curves -----------------------------------------------------------------------

/** A curve through fn(t) for t from t0 to t1 (fn returns [x, y] in board units). */
export function curve(fn, t0, t1, color, n = 48, width = 4) {
  return path(polyline(Array.from({ length: n + 1 }, (_, i) => fn(t0 + ((t1 - t0) * i) / n))), color, width);
}

/** A dashed straight line (one path of short strokes): guides, thresholds, projections. */
export function dashed(x1, y1, x2, y2, color = '#888888', width = 2, dash = 10, gap = 7) {
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const parts = [];
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    parts.push(`M ${r1(x1 + ux * d)} ${r1(y1 + uy * d)} L ${r1(x1 + ux * e)} ${r1(y1 + uy * e)}`);
  }
  return path(parts.join(' '), color, width);
}

/** A sine wave from (x0, y0) over `width`: amplitude and wavelength in board units. */
export const wave = (x0, y0, width, amplitude, wavelength, color = 'blue', phase = 0) =>
  curve((x) => [x, y0 - amplitude * Math.sin(((x - x0) / wavelength) * 2 * Math.PI + phase)], x0, x0 + width, color, Math.max(24, Math.ceil(width / 6)));

/** Arrow from a to b ([x, y]) trimmed so it starts/ends at the edge of circles of radius ra / rb. */
export function connector([ax, ay], [bx, by], { ra = 0, rb = 0, color = 'black', width = 3, head = true } = {}) {
  const d = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / d, uy = (by - ay) / d;
  const from = [r1(ax + ux * ra), r1(ay + uy * ra)], to = [r1(bx - ux * rb), r1(by - uy * rb)];
  return (head ? arrow : line)(...from, ...to, color, width);
}

/** A vector: arrow from (x, y) by (dx, dy), with an optional label (text or { tex }) past its tip. */
export function vector(x, y, dx, dy, label, color = 'red', width = 4) {
  const out = [arrow(x, y, x + dx, y + dy, color, width)];
  if (label) {
    const len = Math.hypot(dx, dy), lx = r1(x + dx + (dx / len) * 22), ly = r1(y + dy + (dy / len) * 22);
    out.push(label.tex ? M(lx, ly, label.tex, 24, { align: 'center', color }) : T(lx, ly, label, 22, { align: 'center', color }));
  }
  return out;
}

/** A horizontal curly brace from x1 to x2 at height y, pointing down (or up), with a label beyond its tip. */
export function brace(x1, x2, y, label, { up = false, color = 'black', depth = 14, size = 22 } = {}) {
  const s = up ? -1 : 1, m = (x1 + x2) / 2, q = depth / 2;
  const d = `M ${r1(x1)} ${r1(y - s * q)} Q ${r1(x1)} ${r1(y)} ${r1(x1 + q * 2)} ${r1(y)} L ${r1(m - q * 2)} ${r1(y)} Q ${r1(m)} ${r1(y)} ${r1(m)} ${r1(y + s * q)}`
    + ` Q ${r1(m)} ${r1(y)} ${r1(m + q * 2)} ${r1(y)} L ${r1(x2 - q * 2)} ${r1(y)} Q ${r1(x2)} ${r1(y)} ${r1(x2)} ${r1(y - s * q)}`;
  const out = [path(d, color, 2.5)];
  if (label) out.push(T(r1(m), r1(y + s * (q + 4 + size / 2)), label, size, { align: 'center', color }));
  return out;
}

// --- Shapes with labels ---------------------------------------------------------------------

/** A labelled node: circle of radius r with a centred label (keep labels short: ~r/6 characters). */
export const node = (x, y, label, { r = 26, color = 'black', fill = '#ffffff', size = 24, textColor } = {}) =>
  [circle(x, y, r, color, fill), T(x, y, String(label), size, { align: 'center', ...(textColor && { color: textColor }) })];

/** A labelled box: rect with a centred label (width is not checked here: the layout lint does it). */
export const box = (x, y, w, h, label, { color = 'black', fill, size = 22, textColor, width = 3 } = {}) =>
  [rect(x, y, w, h, color, fill, width), T(r1(x + w / 2), r1(y + h / 2), String(label), size, { align: 'center', ...(textColor && { color: textColor }) })];

/** A row of boxes with a value in each: `x` left, `y` top, boxes `w` x `h`. */
export function boxes(values, x, y, w, h, color = 'black', fill) {
  return values.flatMap((v, i) => [
    rect(x + i * w, y, w, h, color, fill, 2.5),
    T(x + i * w + w / 2, y + h / 2, String(v), 22, { align: 'center' }),
  ]);
}

/**
 * A chain of labelled boxes joined by arrows (a process, a pipeline): starting at (x, y) top
 * left, each box `w` x `h`, `gap` between boxes, going 'right' or 'down'.
 */
export function flow(labels, { x, y, w = 150, h = 60, gap = 50, dir = 'right', color = 'blue', fill = '#e6eefc', size = 22 } = {}) {
  const out = [];
  labels.forEach((label, i) => {
    const bx = dir === 'right' ? x + i * (w + gap) : x, by = dir === 'right' ? y : y + i * (h + gap);
    out.push(...box(bx, by, w, h, label, { color, fill, size }));
    if (i < labels.length - 1) {
      out.push(dir === 'right'
        ? arrow(bx + w + 4, by + h / 2, bx + w + gap - 4, by + h / 2, color, 3)
        : arrow(bx + w / 2, by + h + 4, bx + w / 2, by + h + gap - 4, color, 3));
    }
  });
  return out;
}

/** A grid of dots (a population, a sample): `cols` x `rows` from centre (x, y), fill per cell via fillAt(col, row). */
export function dotGrid(cols, rows, x, y, spacing, r = 10, fillAt = () => '#ffffff', color = 'black') {
  const out = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) out.push(circle(x + col * spacing, y + row * spacing, r, color, fillAt(col, row), 2));
  }
  return out;
}

/** A pie chart: `parts` = [{ value, color, label? }]; slices drawn clockwise from 12 o'clock, labels outside. */
export function pie(cx, cy, r, parts, { size = 20 } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const out = [];
  let a0 = -Math.PI / 2;
  for (const p of parts) {
    const a1 = a0 + (p.value / total) * 2 * Math.PI;
    const n = Math.max(2, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 60)); // arc as short segments (no arcs on the board)
    const arc = Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    out.push(path(polyline([[cx, cy], ...arc], true), p.color, 2.5, fillOf(p.color)));
    if (p.label) {
      const am = (a0 + a1) / 2, lx = cx + (r + 18) * Math.cos(am), ly = cy + (r + 18) * Math.sin(am);
      out.push(T(r1(lx), r1(ly), p.label, size, { align: Math.cos(am) > 0.3 ? 'left' : Math.cos(am) < -0.3 ? 'right' : 'center', color: p.color }));
    }
    a0 = a1;
  }
  return out;
}

/** A light fill matching a board colour (for slices, bars and boxes). */
export const fillOf = (color) => ({ black: '#e8e8e4', blue: '#dbe6fb', red: '#fbe1e1', green: '#dcf2e2', orange: '#fde8d4', purple: '#efe6fb' })[color] ?? color;

/** A legend: coloured line samples with labels, one per row from (x, y). */
export const legend = (x, y, items, { size = 20, rowH = 28 } = {}) =>
  items.flatMap(([color, label], i) => [line(x, y + i * rowH, x + 28, y + i * rowH, color, 5), T(x + 38, y + i * rowH, label, size, { color })]);

/**
 * A table: `rows` of cell strings from (x, y) top left, columns `colW` wide (a number or an
 * array), rows `rowH` tall; the first row is a header (bold rule under it).
 */
export function table(x, y, rows, { colW = 140, rowH = 40, size = 20, color = 'black', header = true } = {}) {
  const widths = Array.isArray(colW) ? colW : rows[0].map(() => colW);
  const W = widths.reduce((a, b) => a + b, 0), H = rows.length * rowH;
  const out = [rect(x, y, W, H, color, null, 2)];
  for (let r = 1; r < rows.length; r++) out.push(line(x, y + r * rowH, x + W, y + r * rowH, color, header && r === 1 ? 3 : 1.5));
  let cx = x;
  widths.slice(0, -1).forEach((w) => { cx += w; out.push(line(cx, y, cx, y + H, color, 1.5)); });
  rows.forEach((cells, r) => {
    let left = x;
    cells.forEach((cell, c) => {
      // Empty cells stay blank (a text element can't be empty).
      if (cell !== '' && cell != null) out.push(T(r1(left + widths[c] / 2), r1(y + r * rowH + rowH / 2), String(cell), size, { align: 'center', ...(header && r === 0 && { color: 'blue' }) }));
      left += widths[c];
    });
  });
  return out;
}

// --- Axes and charts ------------------------------------------------------------------------

/** Chart axes with arrow heads: origin (x0, y0), `w` wide, `h` tall. */
export const axes = (x0, y0, w, h) => [arrow(x0, y0, x0 + w, y0, 'black', 3), arrow(x0, y0, x0, y0 - h, 'black', 3)];

/**
 * A chart frame mapping data to the board: plot area from (x0, y0) (bottom left) `w` x `h`,
 * for data x in [xMin, xMax] and y in [yMin, yMax]. Returns helpers that draw in data units:
 *   x(v), y(v)              data -> board coordinates
 *   axes(xLabel?, yLabel?)  arrows (a bit longer than the plot area) and their labels
 *   ticksX(values, fmt?), ticksY(values, fmt?)   tick marks with labels
 *   grid(xs, ys)            light guide lines
 *   plot(fn, from, to, color)   y = fn(x) as a curve
 *   points([[x, y], ...], color, r)   dots (a scatter plot)
 *   bars(values, { labels, color, gap })   one bar per value, centred on x = 0, 1, 2...
 */
export function chart({ x0, y0, w, h, xMin = 0, xMax = 1, yMin = 0, yMax = 1 }) {
  const x = (v) => r1(x0 + ((v - xMin) / (xMax - xMin)) * w);
  const y = (v) => r1(y0 - ((v - yMin) / (yMax - yMin)) * h);
  const fmt0 = (v) => String(v);
  return {
    x, y,
    axes(xLabel, yLabel) {
      const out = axes(x0, y0, w + 20, h + 20);
      if (xLabel) out.push(T(x0 + w + 30, y0, xLabel, 22)); // just past the arrow tip (leave room on the right)
      if (yLabel) out.push(T(x0 + 12, y0 - h - 34, yLabel, 22));
      return out;
    },
    ticksX: (values, fmt = fmt0) => values.flatMap((v) => [line(x(v), y0, x(v), y0 + 8, 'black', 2), T(x(v), y0 + 24, fmt(v), 18, { align: 'center' })]),
    ticksY: (values, fmt = fmt0) => values.flatMap((v) => [line(x0 - 8, y(v), x0, y(v), 'black', 2), T(x0 - 14, y(v), fmt(v), 18, { align: 'right' })]),
    grid: (xs = [], ys = []) => [...xs.map((v) => line(x(v), y0, x(v), y0 - h, '#cccccc', 1)), ...ys.map((v) => line(x0, y(v), x0 + w, y(v), '#cccccc', 1))],
    plot: (fn, from = xMin, to = xMax, color = 'blue', n = 60) => curve((v) => [x(v), y(fn(v))], from, to, color, n),
    points: (pts, color = 'red', r = 6) => pts.map(([px, py]) => circle(x(px), y(py), r, color, color, 2)),
    bars(values, { labels = [], color = 'blue', gap = 0.3, valueLabels = true } = {}) {
      const step = w / values.length, bw = step * (1 - gap);
      return values.flatMap((v, i) => {
        const left = r1(x0 + i * step + (step - bw) / 2), top = y(v);
        const out = [rect(left, top, r1(bw), r1(y0 - top), color, fillOf(color), 2.5)];
        if (valueLabels) out.push(T(r1(left + bw / 2), r1(top - 16), String(v), 20, { align: 'center', color }));
        if (labels[i]) out.push(T(r1(left + bw / 2), y0 + 22, labels[i], 20, { align: 'center' }));
        return out;
      });
    },
  };
}

/** A number line from x1 to x2 at height y for values from..to, a tick (and number) every `step`. */
export function numberLine(x1, x2, y, from, to, step = 1, { labels = true, color = 'black' } = {}) {
  const out = [arrow(x1 - 10, y, x2 + 24, y, color, 3)];
  const px = (v) => r1(x1 + ((v - from) / (to - from)) * (x2 - x1));
  for (let v = from; v <= to + 1e-9; v += step) {
    const vv = Math.round(v * 1e6) / 1e6;
    out.push(line(px(vv), y - 8, px(vv), y + 8, color, 2));
    if (labels) out.push(T(px(vv), y + 26, String(vv), 20, { align: 'center', color }));
  }
  return out;
}

/** A timeline from x1 to x2 at height y: events [[t, label]] for t in [from, to], labels alternating above/below. */
export function timeline(x1, x2, y, events, { from, to, color = 'black', size = 20 } = {}) {
  from ??= Math.min(...events.map((e) => e[0]));
  to ??= Math.max(...events.map((e) => e[0]));
  const px = (t) => r1(x1 + ((t - from) / (to - from || 1)) * (x2 - x1));
  const out = [arrow(x1 - 10, y, x2 + 24, y, color, 3)];
  events.forEach(([t, label], i) => {
    const above = i % 2 === 0, x = px(t);
    out.push(circle(x, y, 6, color, color, 2), line(x, y + (above ? -6 : 6), x, y + (above ? -26 : 26), color, 1.5),
      T(x, y + (above ? -40 : 40), label, size, { align: 'center' }));
  });
  return out;
}
