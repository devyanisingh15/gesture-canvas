/**
 * Vector drawing data. This is the source of truth for a drawing; the canvas
 * is only a rendering of it. Everything here is plain JSON.
 */

/** A point normalized to the square drawing area: x and y are 0..1, origin top-left. */
export interface Point {
  x: number;
  y: number;
  /** Epoch milliseconds when the point was captured. */
  timestamp: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  /** CSS color. Defaults to the brand violet. */
  color?: string;
  /** Line width in px at a 400px-wide canvas; scales with the canvas. */
  width?: number;
}

export interface Drawing {
  strokes: Stroke[];
}

export const DEFAULT_STROKE_COLOR = "#8b5cf6";
export const DEFAULT_STROKE_WIDTH = 4;
/** Canvas width (CSS px) at which a stroke's width is used as-is. */
export const STROKE_WIDTH_REFERENCE = 400;

export const EMPTY_DRAWING: Drawing = { strokes: [] };
