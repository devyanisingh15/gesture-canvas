import { describe, expect, it } from "vitest";
import { parseDrawing, serializeDrawing } from "./serialization";
import type { Drawing } from "./types";

const drawing: Drawing = {
  strokes: [
    { id: "a", color: "#8b5cf6", width: 4, points: [{ x: 0.1, y: 0.2, timestamp: 1760025600000 }, { x: 0.3, y: 0.4, timestamp: 1760025600033 }] },
    { id: "b", points: [{ x: 0.5, y: 0.5, timestamp: 1760025601000 }, { x: 0.6, y: 0.7, timestamp: 1760025601040 }] },
  ],
};

describe("drawing serialization", () => {
  it("round-trips through JSON", () => {
    expect(parseDrawing(serializeDrawing(drawing))).toEqual(drawing);
  });

  it("includes a format version", () => {
    expect(JSON.parse(serializeDrawing(drawing)).version).toBe(1);
  });

  it("rejects malformed data", () => {
    expect(() => parseDrawing("{}")).toThrow();
    expect(() => parseDrawing(JSON.stringify({ version: 1, strokes: [{ id: "a", points: [{ x: "1", y: 0, timestamp: 0 }] }] }))).toThrow();
  });
});
