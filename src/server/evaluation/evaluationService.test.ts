import { afterEach, describe, expect, it, vi } from "vitest";
import { mvpEvaluator } from "@/features/evaluation/mvpEvaluator";
import type { DrawingEvaluator } from "@/features/evaluation/types";
import { EVALUATION_TIMEOUT_MS, evaluateDrawing, evaluateRound, parseBatch, scoreRound } from "./evaluationService";
import { getEvaluator } from "./evaluators";

const T = 1_760_000_000_000;
const strokes = {
  version: 1,
  strokes: [
    { id: "a", points: [{ x: 0.2, y: 0.2, timestamp: T }, { x: 0.8, y: 0.8, timestamp: T + 33 }] },
    { id: "b", points: [{ x: 0.8, y: 0.2, timestamp: T + 66 }, { x: 0.2, y: 0.8, timestamp: T + 100 }] },
  ],
};
const square = {
  version: 1,
  strokes: [{ id: "sq", points: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]].map(([x, y], i) => ({ x, y, timestamp: T + i * 100 })) }],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("parseBatch", () => {
  it("reads the database's batch", () => {
    expect(parseBatch({ round_id: "r", prompt: "cat", players: ["p1", "p2"], drawings: [{ player_id: "p1", strokes }] })).toEqual({
      prompt: "cat",
      players: ["p1", "p2"],
      drawings: [{ playerId: "p1", strokes }],
    });
  });
  it("is null when there's nothing to score", () => {
    expect(parseBatch(null)).toBeNull();
    expect(parseBatch({ prompt: "dragon", players: [] })).toBeNull();
  });
});

describe("scoreRound", () => {
  it("scores several drawings, each on its own; no drawing or a broken one scores 0", async () => {
    const batch = parseBatch({
      prompt: "house",
      players: ["cross", "square", "missing", "broken"],
      drawings: [
        { player_id: "cross", strokes },
        { player_id: "square", strokes: square },
        { player_id: "broken", strokes: { version: 1, strokes: [{ nope: true }] } },
      ],
    })!;
    const scores = await scoreRound(batch, mvpEvaluator);
    expect(scores.map((s) => s.player_id)).toEqual(["cross", "square", "missing", "broken"]);
    expect(scores[0]!.score).toBeGreaterThan(0);
    expect(scores[1]!.score).toBeGreaterThan(0);
    expect(scores[0]!.score).not.toBe(scores[1]!.score);
    expect(Object.keys(scores[0]!.breakdown).sort()).toEqual(["completeness", "composition", "evaluator", "feedback", "structure"]);
    expect(scores[0]!.breakdown.evaluator).toBe("mvp-geometry-v1");
    expect(scores[2]).toMatchObject({ score: 0, breakdown: { structure: 0, completeness: 0, composition: 0, feedback: "No drawing was handed in this round." } });
    expect(scores[3]).toMatchObject({ score: 0 });
  });

  it("gives 0 when the evaluator fails, instead of failing the round", async () => {
    const batch = parseBatch({ prompt: "sun", players: ["p"], drawings: [{ player_id: "p", strokes }] })!;
    const scores = await scoreRound(batch, { id: "down", evaluate: () => Promise.reject(new Error("model down")) });
    expect(scores).toEqual([{ player_id: "p", score: 0, breakdown: { structure: 0, completeness: 0, composition: 0, evaluator: "down" } }]);
  });
});

describe("evaluateDrawing", () => {
  it("passes the prompt and the validated drawing to the evaluator, and clamps its answer", async () => {
    const evaluate = vi.fn(async () => ({ score: 250, breakdown: { structure: 101, completeness: -1, composition: 50.4 } }));
    const r = await evaluateDrawing({ id: "x", evaluate }, "house", strokes);
    expect(evaluate).toHaveBeenCalledWith({ prompt: "house", drawing: { strokes: strokes.strokes } });
    expect(r).toEqual({ score: 100, breakdown: { structure: 100, completeness: 0, composition: 50 } });
  });

  it("never shows the evaluator an invalid drawing", async () => {
    const evaluate = vi.fn();
    const outside = { version: 1, strokes: [{ id: "a", points: [{ x: 2, y: 0, timestamp: T }, { x: 0, y: 0, timestamp: T }] }] };
    expect(await evaluateDrawing({ id: "x", evaluate }, "house", outside)).toMatchObject({ score: 0 });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("gives 0 when the evaluator takes too long", async () => {
    vi.useFakeTimers();
    const slow: DrawingEvaluator = { id: "slow", evaluate: () => new Promise(() => {}) };
    const pending = evaluateDrawing(slow, "house", strokes);
    await vi.advanceTimersByTimeAsync(EVALUATION_TIMEOUT_MS);
    expect(await pending).toMatchObject({ score: 0 });
  });
});

describe("getEvaluator", () => {
  it("uses the MVP evaluator unless DRAWING_EVALUATOR names another", () => {
    expect(getEvaluator()).toBe(mvpEvaluator);
    vi.stubEnv("DRAWING_EVALUATOR", "mvp");
    expect(getEvaluator()).toBe(mvpEvaluator);
    vi.stubEnv("DRAWING_EVALUATOR", "nope");
    expect(() => getEvaluator()).toThrow(/Unknown DRAWING_EVALUATOR/);
  });
});

describe("evaluateRound", () => {
  type Call = { fn: string; args: unknown };
  const client = (answers: Record<string, { data?: unknown; error?: { code: string } | null }>, calls: Call[]) =>
    ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: answers[fn]?.data ?? null, error: answers[fn]?.error ?? null };
      },
    }) as never;

  it("checks as the player, reads and stores with the server's client", async () => {
    const playerCalls: Call[] = [];
    const adminCalls: Call[] = [];
    const out = await evaluateRound("r1", {
      player: client({ request_evaluation: { data: true } }, playerCalls),
      admin: client(
        {
          evaluation_batch: { data: { prompt: "house", players: ["p1", "p2"], drawings: [{ player_id: "p1", strokes: square }] } },
          record_scores: { data: true },
        },
        adminCalls,
      ),
      evaluator: mvpEvaluator,
    });
    expect(out).toEqual({ status: "scored" });
    expect(playerCalls.map((c) => c.fn)).toEqual(["request_evaluation"]);
    expect(adminCalls.map((c) => c.fn)).toEqual(["evaluation_batch", "record_scores"]);
    const stored = (adminCalls[1]!.args as { p_scores: { player_id: string; score: number }[] }).p_scores;
    expect(stored.map((s) => s.player_id)).toEqual(["p1", "p2"]);
    expect(stored[0]!.score).toBeGreaterThan(0);
    expect(stored[1]!.score).toBe(0);
  });

  it("does nothing when the round isn't being evaluated (drawing still open, or already scored)", async () => {
    const adminCalls: Call[] = [];
    const out = await evaluateRound("r1", { player: client({ request_evaluation: { data: false } }, []), admin: client({}, adminCalls), evaluator: mvpEvaluator });
    expect(out).toEqual({ status: "nothing-to-do" });
    expect(adminCalls).toEqual([]);
  });

  it("refuses someone outside the game", async () => {
    const out = await evaluateRound("r1", {
      player: client({ request_evaluation: { error: { code: "42501" } } }, []),
      admin: client({}, []),
      evaluator: mvpEvaluator,
    });
    expect(out).toEqual({ status: "forbidden" });
  });
});
