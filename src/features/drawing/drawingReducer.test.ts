import { describe, expect, it } from "vitest";
import { drawingReducer, initialDrawingState, type DrawingAction, type DrawingState } from "./drawingReducer";

const pt = (x: number, y: number, timestamp = 0) => ({ x, y, timestamp });
const run = (actions: DrawingAction[], state: DrawingState = initialDrawingState) => actions.reduce(drawingReducer, state);

describe("drawingReducer", () => {
  it("draws one stroke: start, continue, end", () => {
    const s = run([
      { type: "stroke/start", id: "a", point: pt(0.1, 0.1) },
      { type: "stroke/continue", point: pt(0.2, 0.2) },
      { type: "stroke/continue", point: pt(0.3, 0.3) },
      { type: "stroke/end" },
    ]);
    expect(s.activeStrokeId).toBeNull();
    expect(s.drawing.strokes).toHaveLength(1);
    expect(s.drawing.strokes[0]!.points.map((p) => [p.x, p.y])).toEqual([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]]);
  });

  it("keeps multiple strokes in order", () => {
    const s = run([
      { type: "stroke/start", id: "a", point: pt(0.1, 0.1) },
      { type: "stroke/continue", point: pt(0.2, 0.2) },
      { type: "stroke/end" },
      { type: "stroke/start", id: "b", point: pt(0.5, 0.5) },
      { type: "stroke/continue", point: pt(0.6, 0.6) },
      { type: "stroke/end" },
    ]);
    expect(s.drawing.strokes.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("ignores continue when no stroke is active (pen up)", () => {
    const s = run([{ type: "stroke/continue", point: pt(0.2, 0.2) }]);
    expect(s).toBe(initialDrawingState);
  });

  it("skips points that barely moved", () => {
    const s = run([
      { type: "stroke/start", id: "a", point: pt(0.5, 0.5) },
      { type: "stroke/continue", point: pt(0.501, 0.5) },
      { type: "stroke/continue", point: pt(0.52, 0.5) },
    ]);
    expect(s.drawing.strokes[0]!.points).toHaveLength(2);
  });

  it("drops a single-point stroke when it ends", () => {
    const s = run([{ type: "stroke/start", id: "a", point: pt(0.5, 0.5) }, { type: "stroke/end" }]);
    expect(s.drawing.strokes).toHaveLength(0);
  });

  it("starting a stroke ends the previous one", () => {
    const s = run([
      { type: "stroke/start", id: "a", point: pt(0.1, 0.1) },
      { type: "stroke/continue", point: pt(0.2, 0.2) },
      { type: "stroke/start", id: "b", point: pt(0.5, 0.5) },
    ]);
    expect(s.drawing.strokes.map((x) => x.id)).toEqual(["a", "b"]);
    expect(s.activeStrokeId).toBe("b");
  });

  it("clamps points to the drawing area", () => {
    const s = run([{ type: "stroke/start", id: "a", point: pt(-0.2, 1.4) }]);
    expect(s.drawing.strokes[0]!.points[0]).toMatchObject({ x: 0, y: 1 });
  });

  it("undo removes the last stroke, including one in progress", () => {
    const base = run([
      { type: "stroke/start", id: "a", point: pt(0.1, 0.1) },
      { type: "stroke/continue", point: pt(0.2, 0.2) },
      { type: "stroke/end" },
      { type: "stroke/start", id: "b", point: pt(0.5, 0.5) },
    ]);
    const s = drawingReducer(base, { type: "undo" });
    expect(s.drawing.strokes.map((x) => x.id)).toEqual(["a"]);
    expect(s.activeStrokeId).toBeNull();
    expect(drawingReducer(initialDrawingState, { type: "undo" })).toBe(initialDrawingState);
  });

  it("clear empties the drawing", () => {
    const s = run([
      { type: "stroke/start", id: "a", point: pt(0.1, 0.1) },
      { type: "stroke/continue", point: pt(0.2, 0.2) },
      { type: "clear" },
    ]);
    expect(s.drawing.strokes).toEqual([]);
    expect(s.activeStrokeId).toBeNull();
  });

  it("never mutates previous state", () => {
    const a = run([{ type: "stroke/start", id: "a", point: pt(0.1, 0.1) }]);
    const snapshot = JSON.stringify(a);
    drawingReducer(a, { type: "stroke/continue", point: pt(0.4, 0.4) });
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe("stroke/append", () => {
  it("adds a batch of points exactly as one continue per point would", () => {
    const pts = [pt(0.2, 0.2), pt(0.2001, 0.2), pt(0.3, 0.3), pt(1.4, 0.5)];
    const start = drawingReducer(initialDrawingState, { type: "stroke/start", id: "s", point: pt(0.1, 0.1) });
    const one = pts.reduce((s, point) => drawingReducer(s, { type: "stroke/continue", point }), start);
    const batch = drawingReducer(start, { type: "stroke/append", points: pts });
    expect(batch).toEqual(one);
    expect(batch.drawing.strokes[0]!.points).toHaveLength(4);
  });
});
