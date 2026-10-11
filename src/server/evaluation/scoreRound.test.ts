import { describe, expect, it } from "vitest";
import { placeholderEvaluator } from "@/features/evaluation/placeholderEvaluator";
import { parseBatch, scoreRound } from "./scoreRound";

const strokes = {
  version: 1,
  strokes: [
    { id: "a", points: [{ x: 0.2, y: 0.2, timestamp: 1_760_000_000_000 }, { x: 0.8, y: 0.8, timestamp: 1_760_000_000_033 }] },
    { id: "b", points: [{ x: 0.8, y: 0.2, timestamp: 1_760_000_000_066 }, { x: 0.2, y: 0.8, timestamp: 1_760_000_000_100 }] },
  ],
};

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
  it("scores every player; no drawing or a broken one scores 0", async () => {
    const batch = parseBatch({
      prompt: "house",
      players: ["drew", "missing", "broken"],
      drawings: [{ player_id: "drew", strokes }, { player_id: "broken", strokes: { version: 1, strokes: [{ nope: true }] } }],
    })!;
    const scores = await scoreRound(batch, placeholderEvaluator);
    expect(scores.map((s) => s.player_id)).toEqual(["drew", "missing", "broken"]);
    expect(scores[0]!.score).toBeGreaterThan(0);
    expect(Object.keys(scores[0]!.breakdown).sort()).toEqual(["completenessScore", "compositionScore", "shapeScore", "structureScore"]);
    expect(scores[1]).toMatchObject({ score: 0 });
    expect(scores[2]).toMatchObject({ score: 0 });
  });

  it("gives 0 when the evaluator fails, instead of failing the round", async () => {
    const batch = parseBatch({ prompt: "sun", players: ["p"], drawings: [{ player_id: "p", strokes }] })!;
    const scores = await scoreRound(batch, { evaluate: () => Promise.reject(new Error("model down")) });
    expect(scores).toEqual([{ player_id: "p", score: 0, breakdown: { shapeScore: 0, structureScore: 0, completenessScore: 0, compositionScore: 0 } }]);
  });
});
