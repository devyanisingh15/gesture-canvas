import type { Drawing } from "@/features/drawing/types";
import type { PromptId, ScoreBreakdown } from "@/features/game/types";

/**
 * Scores one drawing against its prompt. Implementations can be swapped
 * (heuristic, computer vision, AI model) without touching the game engine.
 */
export interface DrawingEvaluator {
  evaluate(input: { promptId: PromptId; drawing: Drawing }): Promise<ScoreBreakdown>;
}
