import { describe, expect, it } from "vitest";
import { PROMPTS } from "../prompts";
import { leaderboard } from "./selectors";
import { addPlayer, applyEvent, createGame, currentRound, PHASE_DURATIONS, pickPrompt, TRANSITIONS } from "./stateMachine";
import { GameError, type EngineContext, type Game, type GameEvent, type Score } from "./types";

const ctx = (now: number, random = () => 0.5): EngineContext => ({ now, random });
const drawing = { strokes: [{ id: "s", points: [{ x: 0.1, y: 0.1, timestamp: 0 }, { x: 0.9, y: 0.9, timestamp: 1 }] }] };
const score = (playerId: string, total: number): Score => ({
  playerId, roundNumber: 1, shapeScore: total, structureScore: total, completenessScore: total, compositionScore: total, totalScore: total,
});

function newGame(rounds = 2): Game {
  let g = createGame({ name: "Host", avatar: "violet" }, { rounds, drawSeconds: 30 }, { gameId: "g1", hostId: "h", code: "ABC123" }, ctx(0));
  g = addPlayer(g, { name: "Maya", avatar: "pink" }, "m", ctx(10));
  return g;
}

/** Applies an event at a time; returns the new game. */
const at = (g: Game, now: number, e: GameEvent) => applyEvent(g, e, ctx(now));
const expectError = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
};

describe("game creation and joining", () => {
  it("creates a game in LOBBY with the host ready", () => {
    const g = createGame({ name: " Host ", avatar: "violet" }, {}, { gameId: "g", hostId: "h", code: "X" }, ctx(5));
    expect(g.phase).toBe("LOBBY");
    expect(g.players).toEqual([expect.objectContaining({ id: "h", name: "Host", isHost: true, isReady: true })]);
    expect(g.settings).toEqual({ rounds: 3, drawSeconds: 60, maxPlayers: 6 });
  });

  it("rejects duplicate names, full games and joining after start", () => {
    const g = newGame();
    expectError(() => addPlayer(g, { name: "maya", avatar: "sun" }, "x", ctx(1)), "NAME_TAKEN");
    let full = g;
    for (let i = 0; i < 4; i++) full = addPlayer(full, { name: `P${i}`, avatar: "sun" }, `p${i}`, ctx(1));
    expectError(() => addPlayer(full, { name: "Late", avatar: "sun" }, "late", ctx(1)), "GAME_FULL");
    const started = at(at(g, 20, { type: "SET_READY", playerId: "m", ready: true }), 30, { type: "START_GAME", playerId: "h" });
    expectError(() => addPlayer(started, { name: "Late", avatar: "sun" }, "late", ctx(40)), "GAME_IN_PROGRESS");
  });

  it("rejects invalid names and settings", () => {
    expectError(() => createGame({ name: "  ", avatar: "violet" }, {}, { gameId: "g", hostId: "h", code: "X" }, ctx(0)), "INVALID_INPUT");
    expectError(() => createGame({ name: "A", avatar: "violet" }, { rounds: 0 }, { gameId: "g", hostId: "h", code: "X" }, ctx(0)), "INVALID_INPUT");
  });
});

describe("starting", () => {
  it("only the host can start, with 2+ ready players", () => {
    const g = newGame();
    expectError(() => at(g, 20, { type: "START_GAME", playerId: "m" }), "NOT_HOST");
    expectError(() => at(g, 20, { type: "START_GAME", playerId: "h" }), "PLAYERS_NOT_READY");
    const solo = createGame({ name: "Solo", avatar: "violet" }, {}, { gameId: "g", hostId: "h", code: "X" }, ctx(0));
    expectError(() => at(solo, 20, { type: "START_GAME", playerId: "h" }), "NOT_ENOUGH_PLAYERS");
    const ready = at(g, 20, { type: "SET_READY", playerId: "m", ready: true });
    const started = at(ready, 30, { type: "START_GAME", playerId: "h" });
    expect(started.phase).toBe("STARTING");
    expect(started.phaseEndsAt).toBe(30 + PHASE_DURATIONS.STARTING);
  });
});

describe("a full game", () => {
  it("runs every phase in order, driven by the clock and commands", () => {
    let g = at(newGame(2), 20, { type: "SET_READY", playerId: "m", ready: true });
    g = at(g, 100, { type: "START_GAME", playerId: "h" });

    // Ticks before the deadline change nothing.
    expect(at(g, 101, { type: "TICK" })).toBe(g);

    let t = g.phaseEndsAt!;
    g = at(g, t, { type: "TICK" });
    expect(g.phase).toBe("WHEEL_SPINNING");
    expect(g.rounds).toHaveLength(1);
    expect(PROMPTS.map((p) => p.id)).toContain(currentRound(g)!.promptId);

    t = g.phaseEndsAt!;
    g = at(g, t, { type: "TICK" });
    expect(g.phase).toBe("TARGET_REVEALED");

    t = g.phaseEndsAt!;
    g = at(g, t, { type: "TICK" });
    expect(g.phase).toBe("DRAWING");
    expect(g.phaseEndsAt).toBe(t + 30_000);
    expect(currentRound(g)!.drawingEndsAt).toBe(t + 30_000);

    g = at(g, t + 1000, { type: "SUBMIT_DRAWING", playerId: "h", drawing });
    t = g.phaseEndsAt!;
    g = at(g, t, { type: "TICK" });
    expect(g.phase).toBe("TIME_UP");

    // The last drawing arriving during TIME_UP moves straight on.
    g = at(g, t + 500, { type: "SUBMIT_DRAWING", playerId: "m", drawing });
    expect(g.phase).toBe("EVALUATING");
    expect(Object.keys(currentRound(g)!.drawings).sort()).toEqual(["h", "m"]);

    // Scores arrive early; results wait for the minimum evaluation time.
    const evalStart = g.phaseStartedAt;
    g = at(g, evalStart + 100, { type: "SCORES_READY", roundNumber: 1, scores: [score("h", 90), score("m", 70)] });
    expect(g.phase).toBe("EVALUATING");
    g = at(g, evalStart + PHASE_DURATIONS.EVALUATING_MIN, { type: "TICK" });
    expect(g.phase).toBe("ROUND_RESULTS");
    expect(leaderboard(g, "h").map((e) => [e.player.id, e.totalScore, e.rank])).toEqual([["h", 90, 1], ["m", 70, 2]]);

    // Host moves to round 2 with a different prompt.
    expectError(() => at(g, g.phaseStartedAt + 1, { type: "NEXT_ROUND", playerId: "m" }), "NOT_HOST");
    const firstPrompt = currentRound(g)!.promptId;
    g = at(g, g.phaseStartedAt + 1, { type: "NEXT_ROUND", playerId: "h" });
    expect(g.phase).toBe("WHEEL_SPINNING");
    expect(currentRound(g)!.number).toBe(2);
    expect(currentRound(g)!.promptId).not.toBe(firstPrompt);

    // Round 2: host ends the round early, nobody submits, evaluation times out with zeros.
    g = at(g, g.phaseEndsAt!, { type: "TICK" });
    g = at(g, g.phaseEndsAt!, { type: "TICK" });
    expect(g.phase).toBe("DRAWING");
    g = at(g, g.phaseStartedAt + 5, { type: "END_ROUND", playerId: "h" });
    expect(g.phase).toBe("TIME_UP");
    g = at(g, g.phaseEndsAt!, { type: "TICK" });
    expect(g.phase).toBe("EVALUATING");
    g = at(g, g.phaseStartedAt + PHASE_DURATIONS.EVALUATING_MIN, { type: "TICK" });
    expect(g.phase).toBe("EVALUATING");
    g = at(g, g.phaseStartedAt + PHASE_DURATIONS.EVALUATING_MAX, { type: "TICK" });
    expect(g.phase).toBe("ROUND_RESULTS");
    expect(currentRound(g)!.scores.h!.totalScore).toBe(0);

    // Last round: results auto-advance to the final results.
    g = at(g, g.phaseEndsAt!, { type: "TICK" });
    expect(g.phase).toBe("FINAL_RESULTS");
    // Final results stay up for a while, then the game is closed.
    g = at(g, g.phaseEndsAt!, { type: "TICK" });
    expect(g.phase).toBe("COMPLETED");
    expect(g.phaseEndsAt).toBeNull();
    expect(at(g, g.updatedAt + 3_600_000, { type: "TICK" })).toBe(g);
  });

  it("rejects commands in the wrong phase", () => {
    const g = newGame();
    expectError(() => at(g, 1, { type: "SUBMIT_DRAWING", playerId: "h", drawing }), "WRONG_PHASE");
    expectError(() => at(g, 1, { type: "NEXT_ROUND", playerId: "h" }), "WRONG_PHASE");
    expectError(() => at(g, 1, { type: "END_ROUND", playerId: "h" }), "WRONG_PHASE");
    expectError(() => at(g, 1, { type: "SET_READY", playerId: "nobody", ready: true }), "UNKNOWN_PLAYER");
  });

  it("host can end the game early", () => {
    let g = at(newGame(), 20, { type: "SET_READY", playerId: "m", ready: true });
    g = at(g, 30, { type: "START_GAME", playerId: "h" });
    g = at(g, 40, { type: "END_GAME", playerId: "h" });
    expect(g.phase).toBe("FINAL_RESULTS");
  });
});

describe("leaving and connections", () => {
  it("passes host to the next player and ends a running game with too few players", () => {
    let g = at(newGame(), 20, { type: "SET_READY", playerId: "m", ready: true });
    const lobbyLeave = at(g, 25, { type: "LEAVE", playerId: "h" });
    expect(lobbyLeave.hostId).toBe("m");
    expect(lobbyLeave.players[0]).toMatchObject({ id: "m", isHost: true });
    g = at(g, 30, { type: "START_GAME", playerId: "h" });
    g = at(g, 40, { type: "LEAVE", playerId: "m" });
    expect(g.phase).toBe("FINAL_RESULTS");
  });

  it("tracks connection status without changing the version when nothing changes", () => {
    const g = newGame();
    const off = at(g, 5, { type: "SET_CONNECTION", playerId: "m", connection: "disconnected" });
    expect(off.players[1]!.connection).toBe("disconnected");
    expect(at(off, 6, { type: "SET_CONNECTION", playerId: "m", connection: "disconnected" })).toBe(off);
  });
});

describe("prompt selection", () => {
  it("never repeats until every prompt is used", () => {
    const used: string[] = [];
    let i = 0;
    const seq = () => ((i++ * 0.37) % 1);
    for (let n = 0; n < PROMPTS.length; n++) used.push(pickPrompt(used as never, seq));
    expect(new Set(used).size).toBe(PROMPTS.length);
  });

  it("every phase can be left, except COMPLETED", () => {
    for (const [phase, next] of Object.entries(TRANSITIONS)) expect(next.length > 0).toBe(phase !== "COMPLETED");
  });
});
