import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Drawing } from "./types";
import { DRAWING_LIMITS, InvalidDrawingError, prepareDrawingForSubmission, validateDrawing } from "./validation";

const T = 1_760_000_000_000;
const stroke = (id: string, n: number, t0 = T) => ({ id, points: Array.from({ length: n }, (_, i) => ({ x: (i % 10) / 10, y: 0.5, timestamp: t0 + i * 33 })) });
const check = (d: unknown) => validateDrawing(d, { drawSeconds: 45 });
const fails = (d: unknown, why: RegExp) => expect(() => check(d)).toThrow(why);
const pts = (...p: Array<[unknown, unknown, unknown]>) => p.map(([x, y, timestamp]) => ({ x, y, timestamp }));

describe("validateDrawing", () => {
  it("accepts a normal drawing and keeps only the known fields", () => {
    const d = { strokes: [{ ...stroke("a", 3), color: "#8b5cf6", width: 4, extra: 1 }], score: 100, playerId: "x" };
    expect(check(d)).toEqual({ strokes: [{ ...stroke("a", 3), color: "#8b5cf6", width: 4 }] });
    expect(check({ strokes: [] })).toEqual({ strokes: [] });
  });

  it("refuses malformed payloads", () => {
    fails(null, /not a drawing/);
    fails({ strokes: "x" }, /not a drawing/);
    fails({ strokes: [1] }, /stroke is not an object/);
    fails({ strokes: [{ points: stroke("a", 2).points }] }, /bad stroke id/);
    fails({ strokes: [stroke("a", 2), stroke("a", 2, T + 100)] }, /duplicate stroke id/);
    fails({ strokes: [stroke("a", 1)] }, /2 to 1000 points/);
    fails({ strokes: [{ id: "a", points: pts(["0.1", 0, T], [0.2, 0, T]) }] }, /must be numbers/);
    fails({ strokes: [{ id: "a", points: pts([NaN, 0, T], [0.2, 0, T]) }] }, /must be numbers/);
    fails({ strokes: [{ id: "a", points: pts([1.2, 0, T], [0.2, 0, T]) }] }, /outside the canvas/);
    fails({ strokes: [{ id: "a", points: pts([0.1, -0.01, T], [0.2, 0, T]) }] }, /outside the canvas/);
    fails({ strokes: [{ id: "a", points: pts([0.1, 0, 12], [0.2, 0, 13]) }] }, /bad timestamp/);
    fails({ strokes: [{ id: "a", points: pts([0.1, 0, T + 5], [0.2, 0, T]) }] }, /backwards/);
    fails({ strokes: [stroke("a", 2), stroke("b", 2, T + 300_000)] }, /longer than the round/);
    fails({ strokes: [{ ...stroke("a", 2), color: "url(evil)" }] }, /bad color/);
    fails({ strokes: [{ ...stroke("a", 2), width: 999 }] }, /bad width/);
  });

  it("enforces the size limits", () => {
    fails({ strokes: Array.from({ length: 201 }, (_, i) => stroke(`s${i}`, 2)) }, /more than 200 strokes/);
    fails({ strokes: [stroke("a", 1001)] }, /2 to 1000 points/);
    fails({ strokes: Array.from({ length: 5 }, (_, i) => stroke(`s${i}`, 801)) }, /more than 4000 points/);
    fails({ strokes: [{ ...stroke("a", 2), id: "x".repeat(300_000) }] }, /too large|bad stroke id/);
    expect(() => check(null)).toThrow(InvalidDrawingError);
  });
});

describe("prepareDrawingForSubmission", () => {
  it("rounds, drops stray single points, and thins very long drawings until they pass", () => {
    const long: Drawing = { strokes: [stroke("a", 1500), ...Array.from({ length: 4 }, (_, i) => stroke(`b${i}`, 990, T + 1)), stroke("dot", 1)] };
    const ready = prepareDrawingForSubmission(long);
    expect(() => check(ready)).not.toThrow();
    expect(ready.strokes.map((s) => s.id)).toEqual(["a", "b0", "b1", "b2", "b3"]);
    expect(ready.strokes.reduce((n, s) => n + s.points.length, 0)).toBeLessThanOrEqual(DRAWING_LIMITS.points);
    // The ends of each stroke are kept.
    expect(ready.strokes[0]!.points.at(-1)!.timestamp).toBe(T + 1499 * 33);
    expect(prepareDrawingForSubmission({ strokes: [{ id: "a", points: pts([0.123456789, 1.0000001, T + 0.6], [0.2, 0.2, T + 40]) as never }] }).strokes[0]!.points[0])
      .toEqual({ x: 0.1235, y: 1, timestamp: T + 1 });
  });
});

describe("limits match the database", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261011030000_secure_drawing_submission.sql", import.meta.url), "utf8");
  it.each([
    [`> ${DRAWING_LIMITS.bytes}`, "bytes"],
    [`> ${DRAWING_LIMITS.strokes}`, "strokes"],
    [`between 2 and ${DRAWING_LIMITS.pointsPerStroke}`, "points per stroke"],
    [`> ${DRAWING_LIMITS.points}`, "points"],
    [`between 1 and ${DRAWING_LIMITS.strokeIdLength}`, "stroke id length"],
    [`between ${DRAWING_LIMITS.minWidth} and ${DRAWING_LIMITS.maxWidth}`, "width"],
    [`between ${DRAWING_LIMITS.minTimestamp} and ${DRAWING_LIMITS.maxTimestamp}`, "timestamps"],
    [`* 1000 + ${DRAWING_LIMITS.timestampSlackMs}`, "timestamp spread"],
  ])("%s (%s)", (fragment) => expect(sql).toContain(fragment));
});
