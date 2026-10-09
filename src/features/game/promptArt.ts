import type { PromptId } from "./types";

/** A polyline in a 100x100 box. */
export type Polyline = ReadonlyArray<readonly [number, number]>;

function ellipse(cx: number, cy: number, rx: number, ry: number, steps = 32): Polyline {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

const circle = (cx: number, cy: number, r: number, steps?: number) => ellipse(cx, cy, r, r, steps);

function rays(cx: number, cy: number, inner: number, outer: number, count: number): Polyline[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [
      [cx + Math.cos(a) * inner, cy + Math.sin(a) * inner],
      [cx + Math.cos(a) * outer, cy + Math.sin(a) * outer],
    ] as const;
  });
}

/**
 * Reference line art for each prompt. Used for the target illustration,
 * the wheel icons and (in Phase 6) as the evaluation template outline.
 */
export const PROMPT_ART: Record<PromptId, Polyline[]> = {
  rocket: [
    [[50, 6], [50, 20]],
    [[50, 20], [42, 30], [37, 44], [35, 58], [37, 72]],
    [[50, 20], [58, 30], [63, 44], [65, 58], [63, 72]],
    [[43, 34], [57, 34]],
    circle(50, 46, 8),
    [[37, 62], [24, 77], [38, 76]],
    [[63, 62], [76, 77], [62, 76]],
    [[42, 78], [50, 96], [58, 78]],
  ],
  house: [
    [[25, 46], [25, 88], [75, 88], [75, 46]],
    [[18, 50], [50, 18], [82, 50]],
    [[44, 88], [44, 68], [56, 68], [56, 88]],
    [[31, 54], [40, 54], [40, 62], [31, 62], [31, 54]],
    [[60, 54], [69, 54], [69, 62], [60, 62], [60, 54]],
  ],
  tree: [
    [[45, 90], [45, 62]],
    [[55, 90], [55, 62]],
    ellipse(50, 40, 26, 24),
    [[28, 90], [72, 90]],
  ],
  sun: [circle(50, 50, 18), ...rays(50, 50, 26, 38, 8)],
  car: [
    [[10, 68], [10, 54], [26, 50], [36, 36], [64, 36], [74, 50], [90, 54], [90, 68], [80, 68]],
    [[60, 68], [40, 68]],
    [[20, 68], [10, 68]],
    circle(30, 68, 9),
    circle(70, 68, 9),
    [[40, 50], [42, 40], [50, 40], [50, 50], [40, 50]],
    [[55, 50], [55, 40], [62, 40], [68, 50], [55, 50]],
  ],
  fish: [
    ellipse(44, 50, 28, 17),
    [[71, 50], [90, 34], [88, 66], [71, 50]],
    circle(28, 46, 3, 12),
    [[50, 38], [54, 50], [50, 62]],
  ],
  cat: [
    circle(50, 56, 25),
    [[31, 41], [30, 16], [46, 32]],
    [[54, 32], [70, 16], [69, 41]],
    circle(41, 52, 3, 12),
    circle(59, 52, 3, 12),
    [[47, 62], [50, 65], [53, 62]],
    [[12, 58], [36, 62]],
    [[12, 68], [36, 66]],
    [[88, 58], [64, 62]],
    [[88, 68], [64, 66]],
  ],
  flower: [
    circle(50, 36, 7),
    circle(50, 20, 9),
    circle(64, 30, 9),
    circle(60, 46, 9),
    circle(40, 46, 9),
    circle(36, 30, 9),
    [[50, 52], [50, 94]],
    [[50, 74], [66, 64], [62, 76], [50, 80]],
  ],
  guitar: [
    circle(50, 72, 20),
    circle(50, 46, 14),
    circle(50, 68, 6, 16),
    [[46, 34], [46, 10]],
    [[54, 34], [54, 10]],
    [[43, 10], [43, 2], [57, 2], [57, 10], [43, 10]],
    [[42, 84], [58, 84]],
  ],
  airplane: [
    ellipse(50, 50, 40, 7),
    [[46, 46], [32, 18], [42, 18], [60, 46]],
    [[46, 54], [32, 82], [42, 82], [60, 54]],
    [[14, 46], [8, 32], [16, 32], [24, 45]],
  ],
};
