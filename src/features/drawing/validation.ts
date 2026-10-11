import type { Drawing, Point, Stroke } from "./types";

/**
 * What a submitted drawing may contain. The database checks the same limits
 * in private.validated_drawing (supabase/migrations/*_secure_drawing_submission.sql);
 * validation.test.ts keeps the two in step.
 *
 * A 45 s round at 30 frames a second is at most ~1,350 points, so these only
 * stop malformed or abusive payloads, never a real drawing.
 */
export const DRAWING_LIMITS = {
  strokes: 200,
  pointsPerStroke: 1000,
  points: 4000,
  /** Serialized JSON size. */
  bytes: 262_144,
  strokeIdLength: 64,
  minWidth: 0.5,
  maxWidth: 40,
  /**
   * Point timestamps come from the player's clock (epoch ms), which can be off by
   * any amount, so they are only checked to be plausible dates (2017-07-14 to 2100),
   * in order within a stroke, and spread over no longer than the round.
   */
  minTimestamp: 1_500_000_000_000,
  maxTimestamp: 4_102_444_800_000,
  /** All of a drawing's points fall within the round's length plus this (a refresh or reconnect mid-round). */
  timestampSlackMs: 120_000,
} as const;

const COLOR = /^#[0-9a-fA-F]{3,8}$/;

export class InvalidDrawingError extends Error {
  constructor(message: string) {
    super(`Invalid drawing: ${message}`);
    this.name = "InvalidDrawingError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Checks an untrusted drawing and returns a clean copy with only the known
 * fields. Throws InvalidDrawingError naming the first problem.
 * `drawSeconds` (the round's length) bounds the spread of point timestamps.
 */
export function validateDrawing(value: unknown, { drawSeconds }: { drawSeconds: number }): Drawing {
  const L = DRAWING_LIMITS;
  const bad = (m: string): never => {
    throw new InvalidDrawingError(m);
  };
  if (!isRecord(value) || !Array.isArray(value.strokes)) return bad("not a drawing");
  if (JSON.stringify({ version: 1, strokes: value.strokes }).length > L.bytes) bad("too large");
  if (value.strokes.length > L.strokes) bad(`more than ${L.strokes} strokes`);
  const ids = new Set<string>();
  let total = 0;
  let first = Infinity;
  let last = -Infinity;
  const strokes = value.strokes.map((s): Stroke => {
    if (!isRecord(s)) return bad("stroke is not an object");
    if (typeof s.id !== "string" || s.id.length < 1 || s.id.length > L.strokeIdLength) bad("bad stroke id");
    if (ids.has(s.id as string)) bad("duplicate stroke id");
    ids.add(s.id as string);
    if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > L.pointsPerStroke) bad(`a stroke needs 2 to ${L.pointsPerStroke} points`);
    if (s.color !== undefined && (typeof s.color !== "string" || !COLOR.test(s.color))) bad("bad color");
    if (s.width !== undefined && (!isNum(s.width) || s.width < L.minWidth || s.width > L.maxWidth)) bad("bad width");
    total += (s.points as unknown[]).length;
    if (total > L.points) bad(`more than ${L.points} points`);
    let prev = -Infinity;
    const points = (s.points as unknown[]).map((p): Point => {
      if (!isRecord(p) || !isNum(p.x) || !isNum(p.y) || !isNum(p.timestamp)) return bad("point coordinates must be numbers");
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) bad("point outside the canvas");
      if (p.timestamp < L.minTimestamp || p.timestamp > L.maxTimestamp) bad("bad timestamp");
      if (p.timestamp < prev) bad("timestamps go backwards");
      prev = p.timestamp;
      first = Math.min(first, p.timestamp);
      last = Math.max(last, p.timestamp);
      return { x: p.x, y: p.y, timestamp: p.timestamp };
    });
    const stroke: Stroke = { id: s.id as string, points };
    if (s.color !== undefined) stroke.color = s.color as string;
    if (s.width !== undefined) stroke.width = s.width as number;
    return stroke;
  });
  if (last - first > drawSeconds * 1000 + L.timestampSlackMs) bad("timestamps span longer than the round");
  return { strokes };
}

/** Keeps every `step`-th point plus the last, so the stroke's shape survives. */
function thin(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = Math.ceil((points.length - 1) / (max - 1));
  const out = points.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]!);
  return out;
}

const round4 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;

/**
 * Shapes a local drawing for hand-in so it passes validation: coordinates
 * rounded (0.0001 of the canvas, far below a pixel) and clamped, timestamps
 * whole milliseconds, single-point strokes dropped, and very long drawings
 * thinned rather than refused.
 */
export function prepareDrawingForSubmission(drawing: Drawing): Drawing {
  const L = DRAWING_LIMITS;
  let strokes = drawing.strokes
    .filter((s) => s.points.length >= 2)
    .slice(0, L.strokes)
    .map((s) => ({
      ...s,
      points: thin(
        s.points.map((p) => ({ x: round4(p.x), y: round4(p.y), timestamp: Math.round(p.timestamp) })),
        L.pointsPerStroke,
      ),
    }));
  const total = strokes.reduce((n, s) => n + s.points.length, 0);
  if (total > L.points) {
    const share = L.points / total;
    strokes = strokes.map((s) => ({ ...s, points: thin(s.points, Math.max(2, Math.floor(s.points.length * share))) }));
  }
  return { strokes };
}
