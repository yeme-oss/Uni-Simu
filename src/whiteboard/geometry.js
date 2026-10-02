// Pure geometry helpers: SVG path-data parsing and lengths. No DOM.

const CURVE_SAMPLES = 24;

/**
 * Parses SVG path data into absolute segments. Supported commands: M L H V C S Q T Z
 * (absolute and relative). Throws an Error with a readable message otherwise.
 * Returns [{ cmd: 'M'|'L'|'C'|'Q'|'Z', points: [[x, y], ...] }].
 */
export function parsePath(d) {
  const tokens = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const segments = [];
  let i = 0;
  let cmd = null;
  let x = 0, y = 0, startX = 0, startY = 0;
  let lastControl = null; // for S/T reflection
  let lastCmd = null;

  const num = () => {
    const t = tokens[i++];
    const n = Number(t);
    if (t === undefined || Number.isNaN(n)) throw new Error(`invalid path data near "${t ?? 'end'}"`);
    return n;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (!/[MLHVCSQTZ]/i.test(cmd)) throw new Error(`unsupported path command "${cmd}" (use M L H V C S Q T Z)`);
    } else if (cmd === null) {
      throw new Error('path data must start with M');
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + num(); y = oy + num();
        startX = x; startY = y;
        segments.push({ cmd: 'M', points: [[x, y]] });
        cmd = rel ? 'l' : 'L'; // extra coordinate pairs are implicit line-tos
        lastControl = null;
        break;
      }
      case 'L': x = ox + num(); y = oy + num(); segments.push({ cmd: 'L', points: [[x, y]] }); lastControl = null; break;
      case 'H': x = ox + num(); segments.push({ cmd: 'L', points: [[x, y]] }); lastControl = null; break;
      case 'V': y = oy + num(); segments.push({ cmd: 'L', points: [[x, y]] }); lastControl = null; break;
      case 'C': {
        const c1 = [ox + num(), oy + num()], c2 = [ox + num(), oy + num()];
        x = ox + num(); y = oy + num();
        segments.push({ cmd: 'C', points: [c1, c2, [x, y]] });
        lastControl = c2;
        break;
      }
      case 'S': {
        const c1 = lastControl && /[CS]/i.test(lastCmd) ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
        const c2 = [ox + num(), oy + num()];
        x = ox + num(); y = oy + num();
        segments.push({ cmd: 'C', points: [c1, c2, [x, y]] });
        lastControl = c2;
        break;
      }
      case 'Q': {
        const c = [ox + num(), oy + num()];
        x = ox + num(); y = oy + num();
        segments.push({ cmd: 'Q', points: [c, [x, y]] });
        lastControl = c;
        break;
      }
      case 'T': {
        const c = lastControl && /[QT]/i.test(lastCmd) ? [2 * x - lastControl[0], 2 * y - lastControl[1]] : [x, y];
        x = ox + num(); y = oy + num();
        segments.push({ cmd: 'Q', points: [c, [x, y]] });
        lastControl = c;
        break;
      }
      case 'Z': x = startX; y = startY; segments.push({ cmd: 'Z', points: [[x, y]] }); lastControl = null; break;
    }
    lastCmd = cmd;
  }
  if (!segments.length || segments[0].cmd !== 'M') throw new Error('path data must start with M');
  return segments;
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function curveLength(p0, controls, p3) {
  const at = (t) => {
    const u = 1 - t;
    if (controls.length === 1) { // quadratic
      const [c] = controls;
      return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p3[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p3[1]];
    }
    const [c1, c2] = controls;
    return [
      u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p3[1],
    ];
  };
  let length = 0;
  let prev = p0;
  for (let k = 1; k <= CURVE_SAMPLES; k++) {
    const p = at(k / CURVE_SAMPLES);
    length += dist(prev, p);
    prev = p;
  }
  return length;
}

/** Total drawn length of SVG path data (move-tos don't count). */
export function pathLength(d) {
  let length = 0;
  let pos = [0, 0];
  for (const { cmd, points } of parsePath(d)) {
    const end = points.at(-1);
    if (cmd === 'L' || cmd === 'Z') length += dist(pos, end);
    else if (cmd === 'C') length += curveLength(pos, points.slice(0, 2), end);
    else if (cmd === 'Q') length += curveLength(pos, points.slice(0, 1), end);
    pos = end;
  }
  return length;
}

// Small vector helpers used by components.
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => scale(a, 1 / (len(a) || 1));
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Perpendicular (rotated 90° counter-clockwise in screen coordinates, y down). */
export const perp = (a) => [a[1], -a[0]];
