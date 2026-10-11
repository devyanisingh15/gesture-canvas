import type { EvaluationResult } from "./types";

export const FEEDBACK_MAX_LENGTH = 280;

const part = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
};

/**
 * Makes any evaluator's answer safe to store: score and parts whole numbers
 * 0–100 (anything missing or not a number is 0), feedback a short single line
 * or left out. An evaluator backed by a model can return anything.
 */
export function normalizeResult(value: unknown): EvaluationResult {
  const r = (value ?? {}) as Partial<Record<keyof EvaluationResult, unknown>>;
  const b = (r.breakdown ?? {}) as Record<string, unknown>;
  const result: EvaluationResult = {
    score: part(r.score),
    breakdown: { structure: part(b.structure), completeness: part(b.completeness), composition: part(b.composition) },
  };
  if (typeof r.feedback === "string") {
    const feedback = r.feedback.replace(/\s+/g, " ").trim().slice(0, FEEDBACK_MAX_LENGTH);
    if (feedback) result.feedback = feedback;
  }
  return result;
}

export const ZERO_RESULT: EvaluationResult = { score: 0, breakdown: { structure: 0, completeness: 0, composition: 0 } };
