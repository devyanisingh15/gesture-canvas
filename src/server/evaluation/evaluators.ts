import { mvpEvaluator } from "@/features/evaluation/mvpEvaluator";
import type { DrawingEvaluator } from "@/features/evaluation/types";

/**
 * The evaluators this server can use, by id. To add a computer-vision or AI
 * evaluator, implement DrawingEvaluator (reading any API key from a server
 * environment variable, never a NEXT_PUBLIC_ one), add it here and set
 * DRAWING_EVALUATOR to its id.
 */
const EVALUATORS: Record<string, DrawingEvaluator> = {
  [mvpEvaluator.id]: mvpEvaluator,
  mvp: mvpEvaluator,
};

/** The evaluator named by DRAWING_EVALUATOR, or the MVP one. Server only. */
export function getEvaluator(): DrawingEvaluator {
  if (typeof window !== "undefined") throw new Error("Drawings are only evaluated on the server.");
  const name = process.env.DRAWING_EVALUATOR?.trim();
  if (!name) return mvpEvaluator;
  const evaluator = EVALUATORS[name];
  if (!evaluator) throw new Error(`Unknown DRAWING_EVALUATOR "${name}". Known: ${Object.keys(EVALUATORS).join(", ")}`);
  return evaluator;
}
