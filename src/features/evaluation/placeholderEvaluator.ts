import type { Drawing } from "@/features/drawing/types";
import type { ScoreBreakdown } from "@/features/game/types";
import type { DrawingEvaluator } from "./types";

/**
 * Stand-in scorer until the Phase 6 evaluator lands. It rewards drawings that
 * have some ink, a few strokes and use the canvas well. It does not look at
 * what was drawn, so it can't tell a rocket from a cat.
 */
export const placeholderEvaluator: DrawingEvaluator = {
  async evaluate({ drawing }) {
    return scoreByCoverage(drawing);
  },
};

export function scoreByCoverage(drawing: Drawing): ScoreBreakdown {
  const points = drawing.strokes.flatMap((s) => s.points);
  if (points.length < 2) return { shapeScore: 0, structureScore: 0, completenessScore: 0, compositionScore: 0, totalScore: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  let length = 0;
  for (const s of drawing.strokes) {
    for (let i = 1; i < s.points.length; i++) {
      length += Math.hypot(s.points[i]!.x - s.points[i - 1]!.x, s.points[i]!.y - s.points[i - 1]!.y);
    }
  }
  const shapeScore = Math.round(Math.min(1, length / 3) * 100);
  const structureScore = Math.round(Math.min(1, drawing.strokes.length / 5) * 100);
  const completenessScore = Math.round(Math.min(1, (w * h) / 0.3) * 100);
  const compositionScore = Math.round(Math.max(0, 1 - Math.hypot(cx - 0.5, cy - 0.5) * 2) * 100);
  const totalScore = Math.round((shapeScore + structureScore + completenessScore + compositionScore) / 4);
  return { shapeScore, structureScore, completenessScore, compositionScore, totalScore };
}
