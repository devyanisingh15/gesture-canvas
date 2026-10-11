import type { SupabaseClient } from "@supabase/supabase-js";
import { toDrawing } from "@/features/drawing/serialization";
import { normalizeResult, ZERO_RESULT } from "@/features/evaluation/result";
import type { DrawingEvaluator, EvaluationBreakdown, EvaluationResult } from "@/features/evaluation/types";
import { PROMPTS } from "@/features/game/prompts";
import type { PromptId } from "@/features/game/types";
import type { Database, Json } from "@/lib/supabase/database.types";

/**
 * The evaluation service: the one place drawings become scores.
 *
 *   evaluateDrawing   prompt + stored drawing -> checked result (0 on any failure)
 *   scoreRound        every player of a round
 *   evaluateRound     the Supabase flow: check the round is being evaluated,
 *                     read its drawings, score them, store them in `scores`
 *
 * Runs on the server only. Players can't write scores (the database refuses),
 * and the database only hands out a round's drawings once the round is in
 * EVALUATING, i.e. after its drawing time and hand-in grace are over.
 */

/** How long one drawing may take to evaluate before it scores 0 (a slow model must not hold up the round). */
export const EVALUATION_TIMEOUT_MS = 8_000;

/** What the database hands the scorer for one round (public.evaluation_batch). */
export interface EvaluationBatch {
  prompt: PromptId;
  players: string[];
  drawings: { playerId: string; strokes: unknown }[];
}

/** What is stored in scores.breakdown. */
export interface StoredBreakdown extends EvaluationBreakdown {
  feedback?: string;
  /** Which evaluator gave the score. */
  evaluator: string;
}

/** One row for public.record_scores. */
export interface RoundScore {
  player_id: string;
  score: number;
  breakdown: StoredBreakdown;
}

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
 * Evaluates one drawing as stored (untrusted JSON). No drawing, one that fails
 * validation, an evaluator error or timeout all score 0; whatever the
 * evaluator returns is clamped to 0–100.
 */
export async function evaluateDrawing(evaluator: DrawingEvaluator, prompt: string, stored: unknown): Promise<EvaluationResult> {
  if (stored === null || stored === undefined) return { ...ZERO_RESULT, feedback: "No drawing was handed in this round." };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const drawing = toDrawing(stored);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Evaluation timed out")), EVALUATION_TIMEOUT_MS);
    });
    return normalizeResult(await Promise.race([evaluator.evaluate({ prompt, drawing }), timeout]));
  } catch {
    return ZERO_RESULT;
  } finally {
    clearTimeout(timer);
  }
}

/** Scores every player in a round, so one bad drawing can't hold up the others. */
export async function scoreRound(batch: EvaluationBatch, evaluator: DrawingEvaluator): Promise<RoundScore[]> {
  return Promise.all(
    batch.players.map(async (playerId) => {
      const stored = batch.drawings.find((d) => d.playerId === playerId)?.strokes;
      const result = await evaluateDrawing(evaluator, batch.prompt, stored);
      const breakdown: StoredBreakdown = { ...result.breakdown, evaluator: evaluator.id };
      if (result.feedback) breakdown.feedback = result.feedback;
      return { player_id: playerId, score: result.score, breakdown };
    }),
  );
}

export type EvaluateRoundOutcome =
  | { status: "scored" }
  /** Not in EVALUATING, or already scored: nothing to do. */
  | { status: "nothing-to-do" }
  | { status: "forbidden" }
  | { status: "failed"; step: "check" | "read" | "store" };

/**
 * Scores a round and stores the scores. `player` is the asking player's own
 * client (the database checks they're in the game); `admin` uses the secret
 * key, the only client allowed to read every drawing and write scores.
 */
export async function evaluateRound(
  roundId: string,
  { player, admin, evaluator }: { player: SupabaseClient<Database>; admin: SupabaseClient<Database>; evaluator: DrawingEvaluator },
): Promise<EvaluateRoundOutcome> {
  const asked = await player.rpc("request_evaluation", { p_round_id: roundId });
  if (asked.error) return asked.error.code === "42501" ? { status: "forbidden" } : { status: "failed", step: "check" };
  if (!asked.data) return { status: "nothing-to-do" };

  const batch = await admin.rpc("evaluation_batch", { p_round_id: roundId });
  if (batch.error) return { status: "failed", step: "read" };
  const parsed = parseBatch(batch.data);
  if (!parsed) return { status: "nothing-to-do" };

  const scores = await scoreRound(parsed, evaluator);
  const recorded = await admin.rpc("record_scores", { p_round_id: roundId, p_scores: scores as unknown as Json });
  if (recorded.error) return { status: "failed", step: "store" };
  return recorded.data === true ? { status: "scored" } : { status: "nothing-to-do" };
}
