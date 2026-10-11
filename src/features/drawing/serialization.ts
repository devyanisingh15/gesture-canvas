import type { Drawing, Point, Stroke } from "./types";
import { validateDrawing } from "./validation";

export const DRAWING_FORMAT_VERSION = 1;

interface SerializedDrawing {
  version: typeof DRAWING_FORMAT_VERSION;
  strokes: Stroke[];
}

/** Serializes a drawing to JSON for storage or sending to the server. */
export function serializeDrawing(drawing: Drawing): string {
  const payload: SerializedDrawing = { version: DRAWING_FORMAT_VERSION, strokes: drawing.strokes };
  return JSON.stringify(payload);
}

/** Parses and validates serialized drawing JSON. Throws on malformed input. */
export function parseDrawing(json: string): Drawing {
  const data: unknown = JSON.parse(json);
  if (!isRecord(data) || data.version !== DRAWING_FORMAT_VERSION || !Array.isArray(data.strokes)) {
    throw new Error("Not a Gesture Canvas drawing");
  }
  return { strokes: data.strokes.map(parseStroke) };
}

/** Longest round a game can be set to (s); bounds timestamps when the round's own length isn't at hand. */
const MAX_DRAW_SECONDS = 180;

/**
 * Validates an already-parsed drawing object (e.g. from a request body or the
 * database) against DRAWING_LIMITS. Throws on malformed input.
 */
export function toDrawing(value: unknown): Drawing {
  return validateDrawing(value, { drawSeconds: MAX_DRAW_SECONDS });
}

function parseStroke(value: unknown): Stroke {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.points)) {
    throw new Error("Invalid stroke");
  }
  const stroke: Stroke = { id: value.id, points: value.points.map(parsePoint) };
  if (typeof value.color === "string") stroke.color = value.color;
  if (typeof value.width === "number") stroke.width = value.width;
  return stroke;
}

function parsePoint(value: unknown): Point {
  if (!isRecord(value) || !isNum(value.x) || !isNum(value.y) || !isNum(value.timestamp)) {
    throw new Error("Invalid point");
  }
  return { x: value.x, y: value.y, timestamp: value.timestamp };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
