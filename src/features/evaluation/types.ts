import type { Drawing } from "@/features/drawing/types";

/** What an evaluator is given: the round's prompt and one player's drawing. */
export interface EvaluationInput {
  /** The prompt the player was asked to draw: a prompt id ("house") or its label ("House"). */
  prompt: string;
  drawing: Drawing;
}

/** Each part 0–100. */
export interface EvaluationBreakdown {
  /** Does it have the parts the prompt calls for? */
  structure: number;
  /** Is it a whole, finished drawing rather than a few marks? */
  completeness: number;
  /** Is it sized, placed and proportioned well on the canvas? */
  composition: number;
}

export interface EvaluationResult {
  /** Total, a whole number 0–100. */
  score: number;
  breakdown: EvaluationBreakdown;
  /** One short sentence for the player. */
  feedback?: string;
}

/**
 * Scores one drawing against its prompt. Implementations can be swapped
 * (the deterministic MVP heuristic today; computer vision or an AI model
 * later) without touching the game, the database or the screens: the server
 * picks one in src/server/evaluation/evaluators.ts.
 *
 * Evaluators run on the server only, after the round's drawing time is over.
 * Whatever they return is checked by normalizeResult before it is stored.
 */
export interface DrawingEvaluator {
  /** Stable name, stored with each score so results can be traced to the evaluator that gave them. */
  readonly id: string;
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
