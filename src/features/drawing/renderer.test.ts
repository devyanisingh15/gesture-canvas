import { describe, expect, it } from "vitest";
import { drawStroke, strokeWidthPx } from "./renderer";
import type { Stroke } from "./types";

function recordingContext() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) =>
      prop in target ? target[prop] : (...args: number[]) => calls.push(`${prop}(${args.map((a) => Math.round(a)).join(",")})`),
    set: (target, prop: string, value) => ((target[prop] = value), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, props: ctx };
}

const stroke: Stroke = {
  id: "s",
  points: [
    { x: 0, y: 0, timestamp: 0 },
    { x: 0.5, y: 0, timestamp: 1 },
    { x: 0.5, y: 0.5, timestamp: 2 },
    { x: 1, y: 1, timestamp: 3 },
  ],
};

describe("renderer", () => {
  it("maps normalized points to canvas pixels with smoothed curves", () => {
    const { ctx, calls } = recordingContext();
    drawStroke(ctx, stroke, { width: 200, height: 200 });
    expect(calls).toEqual(["beginPath()", "moveTo(0,0)", "quadraticCurveTo(100,0,100,50)", "quadraticCurveTo(100,100,150,150)", "lineTo(200,200)", "stroke()"]);
  });

  it("draws a dot for a one-point stroke", () => {
    const { ctx, calls } = recordingContext();
    drawStroke(ctx, { id: "d", points: [{ x: 0.5, y: 0.5, timestamp: 0 }] }, { width: 400, height: 400 });
    expect(calls[1]).toMatch(/^arc\(200,200,2/);
  });

  it("scales line width with the canvas so drawings look the same at any size", () => {
    expect(strokeWidthPx({ id: "a", points: [], width: 4 }, 400)).toBe(4);
    expect(strokeWidthPx({ id: "a", points: [], width: 4 }, 800)).toBe(8);
    expect(strokeWidthPx({ id: "a", points: [], width: 4 }, 100)).toBe(1.5);
  });
});
