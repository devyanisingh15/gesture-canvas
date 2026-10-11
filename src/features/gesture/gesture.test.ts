import { describe, expect, it } from "vitest";
import { isOnCanvas, landmarkToCanvasPoint } from "./coordinates";
import { isIndexFingerExtended } from "./landmarks";
import { OneEuroFilter } from "./oneEuroFilter";
import type { HandLandmark } from "./types";

/** Builds a 21-point upright hand; extended fingers point straight up, curled ones fold back. */
function hand({ index, middle }: { index: boolean; middle: boolean }): HandLandmark[] {
  const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));
  const finger = (base: number, x: number, extended: boolean) => {
    lm[base] = { x, y: 0.6, z: 0 }; // MCP
    lm[base + 1] = { x, y: 0.5, z: 0 }; // PIP
    lm[base + 2] = extended ? { x, y: 0.42, z: 0 } : { x, y: 0.56, z: 0 }; // DIP
    lm[base + 3] = extended ? { x, y: 0.35, z: 0 } : { x, y: 0.64, z: 0 }; // TIP
  };
  finger(5, 0.45, index);
  finger(9, 0.5, middle);
  finger(13, 0.55, false);
  finger(17, 0.6, false);
  return lm;
}

describe("index finger detection", () => {
  it("pointing (index up, middle curled) draws", () => {
    expect(isIndexFingerExtended(hand({ index: true, middle: false }))).toBe(true);
  });
  it("fist does not draw", () => {
    expect(isIndexFingerExtended(hand({ index: false, middle: false }))).toBe(false);
  });
  it("open hand / two fingers does not draw", () => {
    expect(isIndexFingerExtended(hand({ index: true, middle: true }))).toBe(false);
  });
  it("incomplete landmarks do not draw", () => {
    expect(isIndexFingerExtended([])).toBe(false);
  });
});

describe("landmarkToCanvasPoint", () => {
  it("mirrors x for the selfie view", () => {
    expect(landmarkToCanvasPoint({ x: 0.2, y: 0.5 }, { margin: 0 })).toEqual({ x: 0.8, y: 0.5 });
  });
  it("maps the inner frame region to the full canvas and clamps", () => {
    expect(landmarkToCanvasPoint({ x: 0.9, y: 0.1 }, { margin: 0.1 })).toEqual({ x: 0, y: 0 });
    expect(landmarkToCanvasPoint({ x: 0.5, y: 0.5 }, { margin: 0.1 })).toEqual({ x: 0.5, y: 0.5 });
    expect(landmarkToCanvasPoint({ x: 0, y: 1 }, { margin: 0.1 })).toEqual({ x: 1, y: 1 });
  });
  it("can report points off the drawing area unclamped", () => {
    const p = landmarkToCanvasPoint({ x: 0.5, y: 0.05 }, { margin: 0.1, clamp: false });
    expect(p.y).toBeLessThan(0);
    expect(isOnCanvas(p)).toBe(false);
    expect(isOnCanvas({ x: 1.01, y: 0.5 }, 0.02)).toBe(true);
  });
});

describe("OneEuroFilter", () => {
  it("damps jitter around a still point", () => {
    const f = new OneEuroFilter();
    let maxDeviation = 0;
    for (let i = 0; i < 60; i++) {
      const out = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i * 33);
      if (i > 10) maxDeviation = Math.max(maxDeviation, Math.abs(out - 0.5));
    }
    expect(maxDeviation).toBeLessThan(0.01);
  });
});
