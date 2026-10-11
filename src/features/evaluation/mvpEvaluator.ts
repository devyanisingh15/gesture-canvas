import type { Drawing } from "@/features/drawing/types";
import { PROMPTS } from "@/features/game/prompts";
import type { DrawingPrompt } from "@/features/game/types";
import { ZERO_RESULT } from "./result";
import type { DrawingEvaluator, EvaluationResult } from "./types";

/**
 * MVP evaluator: deterministic scoring from the drawing's geometry.
 *
 * It does not recognise what was drawn. It measures the strokes (how many,
 * how much ink, closed shapes, straight lines, size, position, proportions)
 * and compares them with what a drawing of the prompt usually has: a car is
 * wide with two round wheels, a rocket is tall, a sun is a circle with
 * straight rays. A careful drawing of the prompt scores well and a stray
 * mark scores low, but a different object with similar geometry can score
 * just as well. Replace it with a computer-vision or AI evaluator by adding
 * one to src/server/evaluation/evaluators.ts; nothing else changes.
 *
 * Same prompt and drawing, same result, every time.
 */
export const mvpEvaluator: DrawingEvaluator = {
  id: "mvp-geometry-v1",
  async evaluate({ prompt, drawing }) {
    return evaluateGeometry(prompt, drawing);
  },
};

/** What a drawing of a prompt usually looks like. Counts are [min, max]; aspect is width / height. */
interface PromptProfile {
  strokes: [number, number];
  closedShapes: [number, number];
  aspect: [number, number];
  /** 0–1: how much the drawing has the prompt's telltale feature (a sun's rays, a car's wheels). */
  signature: (m: Measurements) => number;
}

const DEFAULT_PROFILE: PromptProfile = { strokes: [2, 12], closedShapes: [0, 6], aspect: [0.4, 2.5], signature: () => 1 };

const PROFILES: Record<string, PromptProfile> = {
  // Straight walls, a sloping roof, and no rays.
  house: {
    strokes: [3, 10],
    closedShapes: [0, 4],
    aspect: [0.7, 1.4],
    signature: (m) => (0.4 * Math.min(1, m.axisLines / 3) + 0.2 * Math.min(1, m.verticalLines / 2) + 0.4 * Math.min(1, m.roofLines / 2)) * clamp01(1 - m.radialLines / 8),
  },
  // A big round crown at the top: taller than wide.
  tree: { strokes: [2, 8], closedShapes: [1, 3], aspect: [0.45, 1], signature: (m) => 0.4 * ratioFit(m.aspect, [0.45, 1]) + 0.6 * Math.min(1, m.bigTopLoops) },
  // Rays pointing out from the middle.
  sun: { strokes: [5, 16], closedShapes: [1, 2], aspect: [0.75, 1.33], signature: (m) => Math.min(1, m.radialLines / 5) },
  // Wide, with two wheels.
  car: { strokes: [3, 8], closedShapes: [2, 4], aspect: [1.4, 3.2], signature: (m) => ratioFit(m.aspect, [1.4, 3.2]) * Math.min(1, m.closedShapes / 2) },
  // A long body.
  fish: { strokes: [2, 6], closedShapes: [1, 3], aspect: [1.2, 2.8], signature: (m) => ratioFit(m.aspect, [1.2, 2.8]) },
  // Whiskers: short, roughly level lines.
  cat: { strokes: [4, 14], closedShapes: [1, 4], aspect: [0.7, 1.4], signature: (m) => Math.min(1, m.whiskers / 4) },
  // Tall and narrow.
  rocket: { strokes: [3, 10], closedShapes: [1, 4], aspect: [0.3, 0.7], signature: (m) => ratioFit(m.aspect, [0.3, 0.6], 1.5) },
  // Petals (several loops) and a stem.
  flower: { strokes: [3, 14], closedShapes: [2, 8], aspect: [0.45, 1.1], signature: (m) => 0.5 * Math.min(1, m.closedShapes / 4) + 0.5 * Math.min(1, m.verticalLines) },
  // Long: a body and a neck.
  guitar: { strokes: [2, 8], closedShapes: [1, 3], aspect: [0.25, 0.7], signature: (m) => ratioFit(1 / m.aspect, [1.6, 4]) },
  // Wings and tail: straight lines across a body.
  airplane: { strokes: [3, 8], closedShapes: [0, 3], aspect: [0.8, 2.8], signature: (m) => Math.min(1, m.straightLines / 3) },
};

/** Ink (total stroke length, in canvas widths) a finished drawing usually has. */
const INK_TARGET = 1.5;
/** Below this much ink nothing was really drawn. */
const MIN_INK = 0.03;

/** Part weights in the total. Structure is the only part that depends much on the prompt. */
const WEIGHTS = { structure: 0.5, completeness: 0.25, composition: 0.25 };

export function findPrompt(prompt: string): DrawingPrompt | undefined {
  const key = prompt.trim().toLowerCase();
  return PROMPTS.find((p) => p.id === key || p.label.toLowerCase() === key);
}

export function evaluateGeometry(prompt: string, drawing: Drawing): EvaluationResult {
  const known = findPrompt(prompt);
  const profile = (known && PROFILES[known.id]) ?? DEFAULT_PROFILE;
  const m = measure(drawing);
  if (!m) return { ...ZERO_RESULT, feedback: "Nothing was drawn this round." };

  const structure = 0.25 * countFit(m.strokes, profile.strokes) + 0.25 * countFit(m.closedShapes, profile.closedShapes) + 0.5 * profile.signature(m);

  const inkFit = m.ink <= INK_TARGET * 6 ? Math.min(1, m.ink / INK_TARGET) : Math.max(0, 2 - m.ink / (INK_TARGET * 6));
  const sizeFit = Math.min(1, m.size / 0.45);
  const completeness = 0.5 * inkFit + 0.3 * sizeFit + 0.2 * Math.min(1, m.strokes / profile.strokes[0]);

  const centerFit = clamp01(1 - Math.hypot(m.centerX - 0.5, m.centerY - 0.5) * 2.5);
  const scaleFit = m.size > 0.9 ? clamp01(1 - (m.size - 0.9) * 5) : Math.min(1, m.size / 0.35);
  const marginFit = clamp01(1 - m.edgeShare * 3);
  const composition = 0.3 * centerFit + 0.3 * ratioFit(m.aspect, profile.aspect) + 0.2 * scaleFit + 0.2 * marginFit;

  // Parts and placement can't be judged on a few marks: both count fully only once there is some ink.
  const judged = Math.min(1, m.ink / (INK_TARGET * 0.3));
  const breakdown = { structure: pct(structure * judged), completeness: pct(completeness), composition: pct(composition * judged) };
  const score = pct((WEIGHTS.structure * breakdown.structure + WEIGHTS.completeness * breakdown.completeness + WEIGHTS.composition * breakdown.composition) / 100);
  return { score, breakdown, feedback: feedbackFor(breakdown, known) };
}

interface Measurements {
  strokes: number;
  ink: number;
  closedShapes: number;
  /** Strokes that are straight lines. */
  straightLines: number;
  /** Straight lines that are roughly horizontal or vertical. */
  axisLines: number;
  verticalLines: number;
  /** Straight lines pointing out from the drawing's middle, like rays. */
  radialLines: number;
  /** Sloping straight lines in the upper half. */
  roofLines: number;
  /** Short straight lines within 30° of level. */
  whiskers: number;
  /** Loops at least a third of the drawing's size, in its upper part. */
  bigTopLoops: number;
  /** Longer side of the bounding box, in canvas widths. */
  size: number;
  aspect: number;
  centerX: number;
  centerY: number;
  /** Share of points touching the canvas edge. */
  edgeShare: number;
}

function measure(drawing: Drawing): Measurements | null {
  const strokes = drawing.strokes.filter((s) => s.points.length >= 2);
  let ink = 0;
  let closedShapes = 0;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const loops: { cx: number; cy: number; span: number }[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let points = 0;
  let onEdge = 0;
  for (const s of strokes) {
    let length = 0;
    let sMinX = Infinity;
    let sMinY = Infinity;
    let sMaxX = -Infinity;
    let sMaxY = -Infinity;
    s.points.forEach((p, i) => {
      if (i > 0) length += Math.hypot(p.x - s.points[i - 1]!.x, p.y - s.points[i - 1]!.y);
      sMinX = Math.min(sMinX, p.x);
      sMinY = Math.min(sMinY, p.y);
      sMaxX = Math.max(sMaxX, p.x);
      sMaxY = Math.max(sMaxY, p.y);
      if (p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98) onEdge++;
    });
    points += s.points.length;
    ink += length;
    minX = Math.min(minX, sMinX);
    minY = Math.min(minY, sMinY);
    maxX = Math.max(maxX, sMaxX);
    maxY = Math.max(maxY, sMaxY);
    const first = s.points[0]!;
    const last = s.points[s.points.length - 1]!;
    const chord = Math.hypot(last.x - first.x, last.y - first.y);
    const span = Math.hypot(sMaxX - sMinX, sMaxY - sMinY);
    // A loop: long enough to enclose something, and ends near where it started.
    if (span > 0.05 && length > 0.15 && chord < Math.max(0.04, span * 0.25)) {
      closedShapes++;
      loops.push({ cx: (sMinX + sMaxX) / 2, cy: (sMinY + sMaxY) / 2, span: Math.max(sMaxX - sMinX, sMaxY - sMinY) });
    }
    if (length > 0.05 && chord / length > 0.92) lines.push({ x1: first.x, y1: first.y, x2: last.x, y2: last.y });
  }
  if (strokes.length === 0 || ink < MIN_INK) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const size = Math.max(w, h);
  let axisLines = 0;
  let verticalLines = 0;
  let radialLines = 0;
  let whiskers = 0;
  let roofLines = 0;
  for (const l of lines) {
    const dx = l.x2 - l.x1;
    const dy = l.y2 - l.y1;
    const angle = Math.abs(Math.atan2(dy, dx)) % Math.PI; // 0..π
    const fromAxis = Math.min(angle % (Math.PI / 2), Math.PI / 2 - (angle % (Math.PI / 2)));
    if (fromAxis < 0.21) axisLines++; // within 12°
    if (Math.abs(angle - Math.PI / 2) < 0.26) verticalLines++; // within 15° of vertical
    if (Math.hypot(dx, dy) < size * 0.45 && Math.min(angle, Math.PI - angle) < 0.52) whiskers++;
    if (fromAxis > 0.35 && (l.y1 + l.y2) / 2 < centerY) roofLines++; // over 20° off level and upright
    const mx = (l.x1 + l.x2) / 2 - centerX;
    const my = (l.y1 + l.y2) / 2 - centerY;
    const out = Math.hypot(mx, my);
    if (out > size * 0.15 && Math.abs(dx * mx + dy * my) / (Math.hypot(dx, dy) * out) > 0.9) radialLines++;
  }
  return {
    strokes: strokes.length,
    ink,
    closedShapes,
    straightLines: lines.length,
    axisLines,
    verticalLines,
    radialLines,
    whiskers,
    roofLines,
    bigTopLoops: loops.filter((l) => l.span > size / 3 && l.cy < centerY - h * 0.15).length,
    size,
    aspect: Math.max(w, 0.01) / Math.max(h, 0.01),
    centerX,
    centerY,
    edgeShare: onEdge / points,
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => Math.round(clamp01(v) * 100);

/** 1 inside [lo, hi], falling off linearly outside it. */
function countFit(v: number, [lo, hi]: [number, number]): number {
  if (v < lo) return clamp01(1 - (lo - v) / Math.max(lo, 1));
  if (v > hi) return clamp01(1 - (v - hi) / Math.max(hi, 1));
  return 1;
}

/** 1 inside [lo, hi], 0 once the ratio is `falloff` times outside it. */
function ratioFit(v: number, [lo, hi]: [number, number], falloff = 2.5): number {
  const off = v < lo ? Math.log(lo / v) : v > hi ? Math.log(v / hi) : 0;
  return clamp01(1 - off / Math.log(falloff));
}

function feedbackFor(b: EvaluationResult["breakdown"], prompt: DrawingPrompt | undefined): string {
  const name = prompt ? prompt.label.toLowerCase() : "drawing";
  const [weakest, value] = (Object.entries(b) as [keyof typeof b, number][]).reduce((a, c) => (c[1] < a[1] ? c : a));
  if (value >= 80) return `Great ${name}!`;
  if (weakest === "structure") {
    return prompt ? `A ${name} usually has ${prompt.hint.charAt(0).toLowerCase()}${prompt.hint.slice(1)}.` : "Add the main parts of the drawing.";
  }
  if (weakest === "completeness") return "Keep going: a bigger drawing with more detail scores higher.";
  return `Draw your ${name} bigger, in the middle of the canvas.`;
}
