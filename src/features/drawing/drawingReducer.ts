import type { Drawing, Point, Stroke } from "./types";

/** Points closer than this (fraction of the drawing area) to the previous one are skipped. */
export const MIN_POINT_DISTANCE = 0.004;

export interface DrawingState {
  drawing: Drawing;
  /** Stroke currently being drawn, or null when the pen is up. */
  activeStrokeId: string | null;
}

export type DrawingAction =
  | { type: "stroke/start"; id: string; point: Point; color?: string; width?: number }
  | { type: "stroke/continue"; point: Point }
  | { type: "stroke/append"; points: readonly Point[] }
  | { type: "stroke/end" }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "load"; drawing: Drawing };

export const initialDrawingState: DrawingState = { drawing: { strokes: [] }, activeStrokeId: null };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clampPoint = (p: Point): Point => ({ x: clamp01(p.x), y: clamp01(p.y), timestamp: p.timestamp });

/** Pure state transitions for a drawing. Stroke start → continue → end, plus undo and clear. */
export function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  const { strokes } = state.drawing;
  switch (action.type) {
    case "stroke/start": {
      // Starting a new stroke implicitly ends the previous one.
      const base = endActive(state);
      const stroke: Stroke = { id: action.id, points: [clampPoint(action.point)] };
      if (action.color) stroke.color = action.color;
      if (action.width) stroke.width = action.width;
      return { drawing: { strokes: [...base.drawing.strokes, stroke] }, activeStrokeId: stroke.id };
    }
    case "stroke/continue": {
      const last = strokes[strokes.length - 1];
      if (!state.activeStrokeId || !last || last.id !== state.activeStrokeId) return state;
      const prev = last.points[last.points.length - 1];
      const point = clampPoint(action.point);
      if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) < MIN_POINT_DISTANCE) return state;
      const updated: Stroke = { ...last, points: [...last.points, point] };
      return { ...state, drawing: { strokes: [...strokes.slice(0, -1), updated] } };
    }
    case "stroke/append":
      return action.points.reduce((s, point) => drawingReducer(s, { type: "stroke/continue", point }), state);
    case "stroke/end":
      return endActive(state);
    case "undo":
      if (strokes.length === 0) return state;
      return { drawing: { strokes: strokes.slice(0, -1) }, activeStrokeId: null };
    case "clear":
      return strokes.length === 0 && !state.activeStrokeId ? state : initialDrawingState;
    case "load":
      return { drawing: action.drawing, activeStrokeId: null };
  }
}

/** Ends the active stroke. A stroke with a single point is a stray tap and is dropped. */
function endActive(state: DrawingState): DrawingState {
  if (!state.activeStrokeId) return state;
  const { strokes } = state.drawing;
  const last = strokes[strokes.length - 1];
  if (last && last.id === state.activeStrokeId && last.points.length < 2) {
    return { drawing: { strokes: strokes.slice(0, -1) }, activeStrokeId: null };
  }
  return { ...state, activeStrokeId: null };
}
