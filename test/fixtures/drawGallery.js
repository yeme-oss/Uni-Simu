// Three boards using every helper of src/whiteboard/draw.js: checked by test/draw.test.js
// (schema + layout lint) and handy as examples when writing a new free lecture.
import {
  heading, T, chart, pie, legend, vector, dashed, wave, brace, flow, node, connector, table, dotGrid, numberLine, timeline,
} from '../../src/whiteboard/draw.js';

const spec = (title, steps) => ({ title, steps: steps.map((elements, i) => ({ cue: `s${i + 1}`, elements })) });

// Charts: a bar chart with its scale, and a pie chart.
const sales = chart({ x0: 90, y0: 460, w: 400, h: 300, yMax: 40 });
const charts = spec('Charts', [
  [heading('Charts'), ...sales.axes('product', 'sales'), ...sales.ticksY([0, 10, 20, 30, 40])],
  sales.bars([12, 30, 22, 8], { labels: ['A', 'B', 'C', 'D'], color: 'blue' }),
  pie(760, 280, 120, [
    { value: 45, color: 'blue', label: '45% web' },
    { value: 30, color: 'orange', label: '30% app' },
    { value: 25, color: 'green', label: '25% store' },
  ]),
]);

// Functions and vectors: a plotted function with grid, ticks and points; vectors; a wave.
const f = chart({ x0: 90, y0: 330, w: 400, h: 200, xMin: 0, xMax: 10, yMin: -1, yMax: 1 });
const functions = spec('Functions and vectors', [
  [heading('Functions and vectors'), ...f.grid([2, 4, 6, 8], [0]), ...f.axes('x', 'y'), ...f.ticksX([0, 2, 4, 6, 8, 10])],
  [f.plot(Math.sin, 0, 10, 'blue'), ...f.points([[Math.PI / 2, 1], [(3 * Math.PI) / 2, -1]], 'red'), ...legend(600, 90, [['blue', 'sin x'], ['red', 'extrema']])],
  [...vector(640, 300, 150, -90, { tex: '\\vec{F}' }, 'red'), ...vector(640, 300, 150, 0, { tex: 'F_x' }, 'purple'), dashed(790, 210, 790, 300)],
  [wave(90, 460, 400, 40, 130, 'green'), ...brace(90, 220, 515, 'wavelength'), dashed(600, 460, 940, 460), T(940, 440, 'threshold', 20, { align: 'right' })],
]);

// Diagrams: a process, a graph, a table, a population, a number line and a timeline.
const diagrams = spec('Diagrams', [
  [heading('Diagrams'), ...flow(['Idea', 'Prototype', 'Test', 'Launch'], { x: 60, y: 80, w: 150, h: 56, gap: 50 }), ...brace(60, 410, 150, 'build phase')],
  [...node(120, 270, 'A'), ...node(300, 230, 'B'), ...node(300, 330, 'C'),
    connector([120, 270], [300, 230], { ra: 26, rb: 26 }), connector([120, 270], [300, 330], { ra: 26, rb: 26 }), connector([300, 230], [300, 330], { ra: 26, rb: 26, color: 'red' })],
  [...table(420, 210, [['', '2024', '2025'], ['users', '1,200', '3,400'], ['revenue', '$8k', '$25k']], { colW: [120, 110, 110] }),
    ...dotGrid(8, 3, 800, 220, 22, 8, (c, r) => (c + r * 8 < 15 ? '#bfe8c8' : '#ffffff'))],
  [...numberLine(80, 440, 430, 0, 10, 2), ...timeline(560, 900, 450, [[1969, 'Moon'], [1989, 'Web'], [2007, 'iPhone'], [2022, 'ChatGPT']])],
]);

export const GALLERY = { charts, functions, diagrams };
