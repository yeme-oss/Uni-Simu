// Whiteboard logical coordinate space: matches the right-wall board's aspect
// ratio (~3.2 m × 1.8 m). Specs use these units; the canvas scales them.
export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 560;

// Marker colours a spec may use by name (hex colours are accepted too).
export const INK = {
  black: '#1d1d1f',
  blue: '#1d4fb5',
  red: '#c22f2f',
  green: '#23803a',
  orange: '#d06a12',
  purple: '#6a3d9a',
};

export const DEFAULT_STROKE_WIDTH = 3;
export const DEFAULT_TEXT_SIZE = 22;
export const FONT_FAMILY = 'Patrick Hand';

/** Resolves an ink name or hex colour. */
export const inkColor = (color) => INK[color] ?? color ?? INK.black;
