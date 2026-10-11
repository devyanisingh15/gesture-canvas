import { describe, expect, it } from "vitest";
import type { Game, Round } from "@/features/game/engine/types";
import { viewFor } from "./view";

const T = 1_760_000_000_000;
const drawing = (id: string) => ({ strokes: [{ id, points: [{ x: 0.1, y: 0.1, timestamp: T }, { x: 0.5, y: 0.5, timestamp: T + 33 }] }] });
const score = (playerId: string, n: number, totalScore: number) => ({ playerId, roundNumber: n, totalScore, structureScore: totalScore, completenessScore: totalScore, compositionScore: totalScore });
const round = (n: number, a: number, b: number): Round => ({
  number: n, promptId: "cat", startedAt: 0, drawingStartedAt: 0, drawingEndsAt: 0,
  drawings: { a: { playerId: "a", drawing: drawing(`a${n}`), submittedAt: 1 }, b: { playerId: "b", drawing: drawing(`b${n}`), submittedAt: 1 } },
  scores: { a: score("a", n, a), b: score("b", n, b) },
});
const game = (phase: Game["phase"]): Game => ({
  id: "g", code: "ABCDEF", hostId: "a", settings: { rounds: 3, drawSeconds: 45, maxPlayers: 6 }, phase, phaseStartedAt: 0, phaseEndsAt: null,
  players: [
    { id: "a", name: "Ana", avatar: "violet", isHost: true, isReady: true, connection: "connected", joinedAt: 1 },
    { id: "b", name: "Ben", avatar: "pink", isHost: false, isReady: true, connection: "connected", joinedAt: 2 },
  ],
  rounds: [round(1, 60, 80), round(2, 90, 10)], usedPromptIds: [], createdAt: 0, updatedAt: 0, version: 1,
});

describe("viewFor", () => {
  it("hides the current round's other drawings and every score until its results show", () => {
    for (const phase of ["DRAWING", "TIME_UP", "EVALUATING"] as const) {
      const { game: seen } = viewFor(game(phase), "a", 5);
      const r2 = seen.rounds[1]!;
      expect(r2.drawings.a!.drawing.strokes[0]!.id).toBe("a2");
      expect(r2.drawings.b!.drawing.strokes).toEqual([]);
      expect(Object.keys(r2.drawings)).toEqual(["a", "b"]); // who handed in still shows
      expect(r2.scores).toEqual({});
      expect(seen.rounds[0]!.drawings.b!.drawing.strokes[0]!.id).toBe("b1"); // earlier rounds stay revealed
      expect(seen.standings!.map((s) => [s.playerId, s.total])).toEqual([["b", 80], ["a", 60]]);
    }
  });

  it("shows everything once the results are up, with the leaderboard over every revealed round", () => {
    const { game: seen, serverTime } = viewFor(game("ROUND_RESULTS"), "a", 5);
    expect(serverTime).toBe(5);
    expect(seen.rounds[1]!.drawings.b!.drawing.strokes[0]!.id).toBe("b2");
    expect(seen.standings).toEqual([
      { playerId: "a", total: 150, roundScore: 90, rank: 1, previousRank: 2 },
      { playerId: "b", total: 90, roundScore: 10, rank: 2, previousRank: 1 },
    ]);
  });

  it("someone not in the game sees no unrevealed drawing", () => {
    const { game: seen } = viewFor(game("DRAWING"), null, 5);
    expect(seen.rounds[1]!.drawings.a!.drawing.strokes).toEqual([]);
  });
});
