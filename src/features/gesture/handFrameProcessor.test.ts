import { describe, expect, it } from "vitest";
import { HAND_FRAME_TUNING, HandFrameProcessor, type HandDetection } from "./handFrameProcessor";
import type { HandLandmark } from "./types";

/** Upright hand like gesture.test.ts's; `tipAt` moves the index fingertip. */
function hand({ index = true, middle = false, score = 0.95, tipAt }: { index?: boolean; middle?: boolean; score?: number; tipAt?: [number, number] } = {}): HandDetection {
  const lm: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }));
  const finger = (base: number, x: number, extended: boolean) => {
    lm[base] = { x, y: 0.6, z: 0 };
    lm[base + 1] = { x, y: 0.5, z: 0 };
    lm[base + 2] = extended ? { x, y: 0.42, z: 0 } : { x, y: 0.56, z: 0 };
    lm[base + 3] = extended ? { x, y: 0.35, z: 0 } : { x, y: 0.64, z: 0 };
  };
  finger(5, 0.45, index);
  finger(9, 0.5, middle);
  finger(13, 0.55, false);
  finger(17, 0.6, false);
  if (tipAt) lm[8] = { x: tipAt[0], y: tipAt[1], z: 0 };
  return { landmarks: lm, score };
}

/** Feeds detections 33 ms apart and returns every frame. */
function run(p: HandFrameProcessor, inputs: Array<HandDetection | null>, start = 0) {
  return inputs.map((d, i) => p.next(d, start + i * 33));
}

describe("HandFrameProcessor", () => {
  it("starts drawing once the index finger has been up for a couple of frames", () => {
    const frames = run(new HandFrameProcessor(), [hand(), hand(), hand()]);
    expect(frames.map((f) => f.indexExtended)).toEqual([false, true, true]);
    expect(frames.every((f) => f.handDetected && f.indexTip)).toBe(true);
  });

  it("lifts the pen when the index finger curls or the whole hand opens", () => {
    const p = new HandFrameProcessor();
    run(p, [hand(), hand(), hand()]);
    expect(run(p, [hand({ index: false }), hand({ index: false })], 100).at(-1)!.indexExtended).toBe(false);
    run(p, [hand(), hand()], 200);
    expect(run(p, [hand({ middle: true }), hand({ middle: true })], 300).at(-1)!.indexExtended).toBe(false);
  });

  it("ignores a single-frame flicker", () => {
    const frames = run(new HandFrameProcessor(), [hand(), hand(), hand({ index: false }), hand()]);
    expect(frames.map((f) => f.indexExtended)).toEqual([false, true, true, true]);
  });

  it("holds through a short dropout, then reports the hand gone", () => {
    const p = new HandFrameProcessor();
    run(p, [hand(), hand()]);
    const gap = run(p, Array.from({ length: HAND_FRAME_TUNING.lostFrames }, () => null), 100);
    expect(gap.slice(0, -1).every((f) => f.handDetected && f.indexExtended && f.indexTip)).toBe(true);
    const gone = gap.at(-1)!;
    expect(gone).toMatchObject({ handDetected: false, indexExtended: false, indexTip: null, confidence: null });
  });

  it("starts over after the hand comes back (no instant pen-down)", () => {
    const p = new HandFrameProcessor();
    run(p, [hand(), hand(), null, null, null, null]);
    expect(p.next(hand(), 1000).indexExtended).toBe(false);
  });

  it("lifts the pen at once when tracking confidence drops, keeping the hand and cursor", () => {
    const p = new HandFrameProcessor();
    run(p, [hand(), hand()]);
    const unsure = p.next(hand({ score: HAND_FRAME_TUNING.minDrawConfidence - 0.1 }), 100);
    expect(unsure).toMatchObject({ handDetected: true, indexExtended: false });
    expect(unsure.indexTip).not.toBeNull();
    // Confident again: drawing resumes after the usual couple of frames.
    expect(run(p, [hand(), hand()], 200).map((f) => f.indexExtended)).toEqual([false, true]);
  });

  it("lifts the pen when the fingertip is estimated outside the camera image", () => {
    const p = new HandFrameProcessor();
    run(p, [hand(), hand()]);
    expect(p.next(hand({ tipAt: [0.45, -0.1] }), 100).indexExtended).toBe(false);
  });

  it("maps the fingertip to mirrored canvas coordinates", () => {
    const p = new HandFrameProcessor();
    const f = p.next(hand({ tipAt: [0.3, 0.5] }), 0);
    expect(f.indexTip!.x).toBeGreaterThan(0.5); // left in the camera image = right on the mirrored canvas
    expect(f.indexTip!.y).toBeCloseTo(0.5, 5);
  });
});
