import { describe, expect, it } from "vitest";
import type { Drawing, Point, Stroke } from "@/features/drawing/types";
import { evaluateGeometry, findPrompt, mvpEvaluator } from "./mvpEvaluator";
import { normalizeResult } from "./result";

const T = 1_760_000_000_000;
let n = 0;
const stroke = (pts: [number, number][]): Stroke => ({ id: `s${n++}`, points: pts.map(([x, y], i): Point => ({ x, y, timestamp: T + i * 33 })) });
const line = (x1: number, y1: number, x2: number, y2: number, steps = 10) =>
  stroke(Array.from({ length: steps + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps] as [number, number]));
const circle = (cx: number, cy: number, r: number, rx = r) =>
  stroke(Array.from({ length: 33 }, (_, i) => [cx + rx * Math.cos((i / 32) * 2 * Math.PI), cy + r * Math.sin((i / 32) * 2 * Math.PI)] as [number, number]));
const draw = (...strokes: Stroke[]): Drawing => ({ strokes });

const house = draw(
  line(0.3, 0.45, 0.7, 0.45), line(0.7, 0.45, 0.7, 0.8), line(0.7, 0.8, 0.3, 0.8), line(0.3, 0.8, 0.3, 0.45),
  line(0.28, 0.45, 0.5, 0.22), line(0.5, 0.22, 0.72, 0.45),
  stroke([[0.45, 0.8], [0.45, 0.65], [0.55, 0.65], [0.55, 0.8], [0.45, 0.8]]),
);
const sun = draw(
  circle(0.5, 0.5, 0.15),
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI;
    return line(0.5 + 0.2 * Math.cos(a), 0.5 + 0.2 * Math.sin(a), 0.5 + 0.32 * Math.cos(a), 0.5 + 0.32 * Math.sin(a), 4);
  }),
);
const car = draw(
  stroke([[0.15, 0.6], [0.15, 0.45], [0.35, 0.45], [0.42, 0.33], [0.62, 0.33], [0.7, 0.45], [0.85, 0.45], [0.85, 0.6], [0.15, 0.6]]),
  circle(0.3, 0.63, 0.06),
  circle(0.7, 0.63, 0.06),
);
const tree = draw(circle(0.5, 0.35, 0.17, 0.15), line(0.47, 0.52, 0.47, 0.8), line(0.53, 0.52, 0.53, 0.8), line(0.47, 0.8, 0.53, 0.8, 3));
const cat = draw(
  circle(0.5, 0.5, 0.2),
  stroke([[0.33, 0.38], [0.36, 0.22], [0.44, 0.31]]),
  stroke([[0.56, 0.31], [0.64, 0.22], [0.67, 0.38]]),
  line(0.42, 0.55, 0.22, 0.52, 4), line(0.42, 0.58, 0.22, 0.6, 4), line(0.58, 0.55, 0.78, 0.52, 4), line(0.58, 0.58, 0.78, 0.6, 4),
);
const scribble = draw(line(0.05, 0.05, 0.12, 0.08, 3));

describe("mvpEvaluator", () => {
  it("returns the evaluation contract, every part 0–100", async () => {
    const r = await mvpEvaluator.evaluate({ prompt: "house", drawing: house });
    expect(Object.keys(r.breakdown).sort()).toEqual(["completeness", "composition", "structure"]);
    for (const v of [r.score, ...Object.values(r.breakdown)]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(typeof r.feedback).toBe("string");
  });

  it("scores a nothing drawing 0", () => {
    expect(evaluateGeometry("house", draw())).toMatchObject({ score: 0, breakdown: { structure: 0, completeness: 0, composition: 0 } });
    expect(evaluateGeometry("house", draw(line(0.5, 0.5, 0.505, 0.5, 1)))).toMatchObject({ score: 0 });
  });

  it("is deterministic", () => {
    expect(evaluateGeometry("sun", sun)).toEqual(evaluateGeometry("sun", structuredClone(sun)));
  });

  it("scores careful drawings of the prompt well and a stray mark low", () => {
    const h = evaluateGeometry("house", house).score;
    const s = evaluateGeometry("sun", sun).score;
    const c = evaluateGeometry("car", car).score;
    for (const v of [h, s, c]) expect(v).toBeGreaterThanOrEqual(90);
    expect(evaluateGeometry("house", scribble).score).toBeLessThan(25);
  });

  it("uses the prompt: each drawing scores best for the prompt it was drawn for", () => {
    const drawings = { house, sun, car, tree, cat };
    for (const [prompt, drawing] of Object.entries(drawings)) {
      const own = evaluateGeometry(prompt, drawing).score;
      for (const other of Object.keys(drawings).filter((p) => p !== prompt)) {
        expect(own, `${prompt} drawn, ${other} asked`).toBeGreaterThan(evaluateGeometry(other, drawing).score);
      }
    }
  });

  it("rewards a drawing placed in the middle over the same one in a corner", () => {
    const corner = draw(...house.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p, x: p.x * 0.4, y: p.y * 0.35 })) })));
    expect(evaluateGeometry("house", house).breakdown.composition).toBeGreaterThan(evaluateGeometry("house", corner).breakdown.composition);
  });

  it("accepts the prompt id or its label, and scores unknown prompts generically", () => {
    expect(findPrompt(" House ")?.id).toBe("house");
    expect(evaluateGeometry("House", house)).toEqual(evaluateGeometry("house", house));
    expect(evaluateGeometry("spaceship", house).score).toBeGreaterThan(0);
  });

  it("gives feedback on the weakest part", () => {
    expect(evaluateGeometry("car", draw(line(0.2, 0.5, 0.8, 0.5))).feedback).toBe("A car usually has a body and two wheels.");
    expect(evaluateGeometry("house", draw()).feedback).toBe("Nothing was drawn this round.");
  });
});

describe("normalizeResult", () => {
  it("clamps whatever an evaluator returns to whole numbers 0–100", () => {
    expect(normalizeResult({ score: 140.6, breakdown: { structure: -3, completeness: "70", composition: Number.NaN }, feedback: "  Good\n job  " })).toEqual({
      score: 100,
      breakdown: { structure: 0, completeness: 0, composition: 0 },
      feedback: "Good job",
    });
    expect(normalizeResult(null)).toEqual({ score: 0, breakdown: { structure: 0, completeness: 0, composition: 0 } });
    expect(normalizeResult({ score: 50, breakdown: {}, feedback: "x".repeat(500) }).feedback).toHaveLength(280);
  });
});
