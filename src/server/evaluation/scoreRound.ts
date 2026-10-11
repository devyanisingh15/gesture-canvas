import { toDrawing } from "@/features/drawing/serialization";
import type { DrawingEvaluator } from "@/features/evaluation/types";
import { PROMPTS } from "@/features/game/prompts";
import type { PromptId, ScoreBreakdown } from "@/features/game/types";

/** What the database hands the scorer for one round (public.evaluation_batch). */
export interface EvaluationBatch {
  prompt: PromptId;
  players: string[];
  drawings: { playerId: string; strokes: unknown }[];
}

export interface RoundScore {
  player_id: string;
  score: number;
  breakdown: Omit<ScoreBreakdown, "totalScore">;
}

const ZERO: ScoreBreakdown = { shapeScore: 0, structureScore: 0, completenessScore: 0, compositionScore: 0, totalScore: 0 };
const PROMPT_IDS = new Set<string>(PROMPTS.map((p) => p.id));

/** Reads the database's batch; null if it isn't one (the round isn't being evaluated). */
export function parseBatch(raw: unknown): EvaluationBatch | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.prompt !== "string" || !PROMPT_IDS.has(b.prompt) || !Array.isArray(b.players)) return null;
  return {
    prompt: b.prompt as PromptId,
    players: b.players.map(String),
    drawings: (Array.isArray(b.drawings) ? b.drawings : []).map((d) => {
      const row = (d ?? {}) as Record<string, unknown>;
      return { playerId: String(row.player_id), strokes: row.strokes };
    }),
  };
}

/**
 * Scores every player in a round. A player with no drawing, an unreadable one,
 * or one the evaluator fails on scores 0, so one bad drawing can't hold up the round.
 */
export async function scoreRound(batch: EvaluationBatch, evaluator: DrawingEvaluator): Promise<RoundScore[]> {
  return Promise.all(
    batch.players.map(async (playerId) => {
      const stored = batch.drawings.find((d) => d.playerId === playerId)?.strokes;
      let result = ZERO;
      if (stored) {
        try {
          result = await evaluator.evaluate({ promptId: batch.prompt, drawing: toDrawing(stored) });
        } catch {
          result = ZERO;
        }
      }
      const { totalScore, ...breakdown } = result;
      return { player_id: playerId, score: totalScore, breakdown };
    }),
  );
}
