import { describe, expect, it } from "vitest";
import { DrawingEngine, type DrawingChange } from "./engine";
import { parseDrawing, serializeDrawing } from "./serialization";

const pt = (x: number, y: number, timestamp = 0) => ({ x, y, timestamp });

/** Draws a stroke through the given points and lifts the pen. */
function stroke(e: DrawingEngine, id: string, ...pts: Array<[number, number]>) {
  const [first, ...rest] = pts;
  e.beginStroke(id, pt(...first!));
  rest.forEach((p) => e.addPoint(pt(...p)));
  e.endStroke();
}

describe("DrawingEngine", () => {
  it("draws one stroke: begin, add points, end", () => {
    const e = new DrawingEngine();
    stroke(e, "a", [0.1, 0.1], [0.2, 0.2], [0.3, 0.3]);
    expect(e.isDrawing).toBe(false);
    expect(e.toDrawing().strokes).toHaveLength(1);
    expect(e.toDrawing().strokes[0]!.points.map((p) => [p.x, p.y])).toEqual([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]]);
  });

  it("keeps strokes in order, and stopping and starting makes separate strokes", () => {
    const e = new DrawingEngine();
    stroke(e, "a", [0.1, 0.1], [0.2, 0.2]);
    stroke(e, "b", [0.5, 0.5], [0.6, 0.6]);
    expect(e.toDrawing().strokes.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("ignores points while the pen is up", () => {
    const e = new DrawingEngine();
    expect(e.addPoint(pt(0.2, 0.2))).toBe(false);
    expect(e.strokes).toHaveLength(0);
  });

  it("skips points that barely moved", () => {
    const e = new DrawingEngine();
    e.beginStroke("a", pt(0.5, 0.5));
    expect(e.addPoint(pt(0.501, 0.5))).toBe(false);
    expect(e.addPoint(pt(0.52, 0.5))).toBe(true);
    expect(e.activeStroke!.points).toHaveLength(2);
  });

  it("drops a single-point stroke when it ends", () => {
    const e = new DrawingEngine();
    e.beginStroke("a", pt(0.5, 0.5));
    e.endStroke();
    expect(e.strokes).toHaveLength(0);
  });

  it("beginning a stroke ends the previous one", () => {
    const e = new DrawingEngine();
    e.beginStroke("a", pt(0.1, 0.1));
    e.addPoint(pt(0.2, 0.2));
    e.beginStroke("b", pt(0.5, 0.5));
    expect(e.strokes.map((s) => s.id)).toEqual(["a", "b"]);
    expect(e.activeStroke!.id).toBe("b");
  });

  it("keeps every point inside the drawing area", () => {
    const e = new DrawingEngine();
    e.beginStroke("a", pt(-0.2, 1.4));
    e.addPoint(pt(1.7, -3));
    expect(e.activeStroke!.points).toEqual([pt(0, 1), pt(1, 0)]);
    expect(new DrawingEngine({ strokes: [{ id: "x", points: [pt(2, 2), pt(-1, 0.5)] }] }).strokes[0]!.points).toEqual([pt(1, 1), pt(0, 0.5)]);
  });

  it("undo removes the last stroke, including one in progress", () => {
    const e = new DrawingEngine();
    stroke(e, "a", [0.1, 0.1], [0.2, 0.2]);
    stroke(e, "b", [0.3, 0.3], [0.4, 0.4]);
    e.beginStroke("c", pt(0.5, 0.5));
    e.undo();
    expect(e.strokes.map((s) => s.id)).toEqual(["a", "b"]);
    e.undo();
    expect(e.strokes.map((s) => s.id)).toEqual(["a"]);
    e.undo();
    e.undo(); // nothing left: no-op
    expect(e.strokes).toHaveLength(0);
  });

  it("clear empties the drawing", () => {
    const e = new DrawingEngine();
    stroke(e, "a", [0.1, 0.1], [0.2, 0.2]);
    e.beginStroke("b", pt(0.5, 0.5));
    e.clear();
    expect(e.strokes).toHaveLength(0);
    expect(e.isDrawing).toBe(false);
  });

  it("reports strokes changing separately from points being added", () => {
    const e = new DrawingEngine();
    const seen: DrawingChange[] = [];
    const off = e.subscribe((c) => seen.push(c));
    stroke(e, "a", [0.1, 0.1], [0.2, 0.2], [0.3, 0.3]);
    e.undo();
    off();
    e.clear();
    expect(seen).toEqual(["strokes", "points", "points", "strokes", "strokes"]);
  });

  it("toDrawing is a stable copy: later points don't change it", () => {
    const e = new DrawingEngine();
    e.beginStroke("a", pt(0.1, 0.1));
    expect(e.toDrawing().strokes).toHaveLength(0); // one point isn't a stroke yet
    e.addPoint(pt(0.2, 0.2));
    const first = e.toDrawing();
    expect(e.toDrawing()).toBe(first); // cached until something changes
    e.addPoint(pt(0.3, 0.3));
    expect(first.strokes[0]!.points).toHaveLength(2);
    expect(e.toDrawing().strokes[0]!.points).toHaveLength(3);
  });

  it("redraws a serialized drawing exactly", () => {
    const e = new DrawingEngine();
    stroke(e, "a", [0.1, 0.1], [0.2, 0.25], [0.3, 0.3]);
    stroke(e, "b", [0.6, 0.6], [0.7, 0.65]);
    const restored = new DrawingEngine(parseDrawing(serializeDrawing(e.toDrawing())));
    expect(restored.toDrawing()).toEqual(e.toDrawing());
    const other = new DrawingEngine();
    other.load(parseDrawing(serializeDrawing(e.toDrawing())));
    expect(other.toDrawing()).toEqual(e.toDrawing());
  });
});

describe("DrawingEngine and a caching renderer", () => {
  it("undo gives a new strokes array, so a cached copy of the old one is never mistaken for current", () => {
    const e = new DrawingEngine();
    stroke(e, "a", [0.1, 0.1], [0.2, 0.2]);
    stroke(e, "b", [0.3, 0.3], [0.4, 0.4]);
    const seen = e.strokes;
    e.undo();
    expect(seen).toHaveLength(2);
    expect(e.strokes).toHaveLength(1);
  });
});
