import type { Drawing, Point, Stroke } from "./types";

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

/** Limits on a drawing accepted from a client, so one player can't flood the server. */
export const DRAWING_LIMITS = { strokes: 400, points: 20_000 } as const;

/** Validates an already-parsed drawing object (e.g. from a request body). Throws on malformed input. */
export function toDrawing(value: unknown): Drawing {
  if (!isRecord(value) || !Array.isArray(value.strokes) || value.strokes.length > DRAWING_LIMITS.strokes) {
    throw new Error("Invalid drawing");
  }
  const drawing = { strokes: value.strokes.map(parseStroke) };
  if (drawing.strokes.reduce((n, s) => n + s.points.length, 0) > DRAWING_LIMITS.points) throw new Error("Drawing too large");
  return drawing;
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
