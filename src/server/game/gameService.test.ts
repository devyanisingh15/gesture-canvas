import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DURATIONS } from "@/features/game/engine/stateMachine";
import type { GameState } from "@/features/game/engine/types";
import type { DrawingEvaluator } from "@/features/evaluation/types";
import { GameService } from "./gameService";
import { InMemoryGameRepository } from "./repository";

const drawing = { strokes: [{ id: "a", points: [{ x: 0.2, y: 0.2, timestamp: 1_760_000_000_000 }, { x: 0.8, y: 0.8, timestamp: 1_760_000_000_033 }] }] };

function setup(evaluator: DrawingEvaluator = { evaluate: async () => ({ shapeScore: 80, structureScore: 80, completenessScore: 80, compositionScore: 80, totalScore: 80 }) }) {
  let now = 1_000;
  let id = 0;
  const service = new GameService({
    repo: new InMemoryGameRepository(),
    evaluator,
    now: () => now,
    random: () => 0.3,
    newId: () => `id${++id}`,
    disconnectGraceMs: 1000,
  });
  const advance = async (ms: number) => {
    now += ms;
    await service.tick();
    await flush();
  };
  return { service, advance, setNow: (t: number) => (now = t), getNow: () => now };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe("GameService", () => {
  it("creates and joins games with secret session tokens", async () => {
    const { service } = setup();
    const host = await service.createGame({ name: "Host", avatar: "violet" }, { rounds: 1, drawSeconds: 10 });
    expect(host.session.code).toMatch(/^[A-Z2-9]{6}$/);
    const guest = await service.joinGame(host.session.code.toLowerCase(), { name: "Maya", avatar: "pink" });
    expect(guest.state.game.players.map((p) => p.name)).toEqual(["Host", "Maya"]);
    // Snapshots never carry tokens.
    expect(JSON.stringify(guest.state)).not.toContain(guest.session.token);
    await expect(service.dispatch({ ...guest.session, token: "wrong" }, { type: "SET_READY", ready: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(service.joinGame("NOPE22", { name: "X", avatar: "sun" })).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  });

  it("runs a whole game on the clock, scoring submitted drawings", async () => {
    const { service, advance } = setup();
    const host = await service.createGame({ name: "Host", avatar: "violet" }, { rounds: 1, drawSeconds: 10 });
    const guest = await service.joinGame(host.session.code, { name: "Maya", avatar: "pink" });
    const seen: GameState[] = [];
    service.subscribe(host.session.code, (s) => seen.push(s));

    await expect(service.dispatch(host.session, { type: "START_GAME" })).rejects.toMatchObject({ code: "PLAYERS_NOT_READY" });
    await service.dispatch(guest.session, { type: "SET_READY", ready: true });
    await service.dispatch(host.session, { type: "START_GAME" });

    const phase = async () => (await service.getState(host.session.code)).game.phase;
    await advance(PHASE_DURATIONS.STARTING);
    expect(await phase()).toBe("WHEEL_SPINNING");
    await advance(PHASE_DURATIONS.WHEEL_SPINNING);
    expect(await phase()).toBe("TARGET_REVEALED");
    await advance(PHASE_DURATIONS.TARGET_REVEALED);
    expect(await phase()).toBe("DRAWING");
    await service.dispatch(host.session, { type: "SUBMIT_DRAWING", drawing });
    await advance(10_000);
    expect(await phase()).toBe("TIME_UP");
    // Guest never submits: TIME_UP runs out, scoring gives them zero.
    await advance(PHASE_DURATIONS.TIME_UP);
    expect(await phase()).toBe("EVALUATING");
    await advance(PHASE_DURATIONS.EVALUATING_MIN);
    const { game } = await service.getState(host.session.code);
    expect(game.phase).toBe("ROUND_RESULTS");
    expect(game.rounds[0]!.scores[host.session.playerId]!.totalScore).toBe(80);
    expect(game.rounds[0]!.scores[guest.session.playerId]!.totalScore).toBe(0);
    await service.dispatch(host.session, { type: "NEXT_ROUND" });
    expect(await phase()).toBe("FINAL_RESULTS");

    // Listeners saw every version in order.
    const versions = seen.map((s) => s.game.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(seen.map((s) => s.game.phase)).size).toBe(9); // every phase
  });

  it("serializes concurrent commands on the same game", async () => {
    const { service } = setup();
    const host = await service.createGame({ name: "Host", avatar: "violet" });
    const joins = await Promise.all(["A", "B", "C", "D", "E"].map((name) => service.joinGame(host.session.code, { name, avatar: "sun" })));
    expect(joins.every((j) => j.session.playerId)).toBe(true);
    const { game } = await service.getState(host.session.code);
    expect(game.players).toHaveLength(6);
    await expect(service.joinGame(host.session.code, { name: "F", avatar: "sun" })).rejects.toMatchObject({ code: "GAME_FULL" });
  });

  it("marks players offline only after the grace period", async () => {
    vi.useFakeTimers();
    const { service } = setup();
    const host = await service.createGame({ name: "Host", avatar: "violet" });
    const guest = await service.joinGame(host.session.code, { name: "Maya", avatar: "pink" });
    const close = await service.connect(guest.session);
    close();
    const status = async () => (await service.getState(host.session.code)).game.players[1]!.connection;
    await vi.advanceTimersByTimeAsync(500);
    expect(await status()).toBe("connected");
    // Reconnecting inside the grace period keeps them online.
    const close2 = await service.connect(guest.session);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await status()).toBe("connected");
    close2();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await status()).toBe("disconnected");
  });

  it("falls back to zero when the evaluator fails", async () => {
    const { service, advance } = setup({ evaluate: async () => Promise.reject(new Error("model down")) });
    const host = await service.createGame({ name: "Host", avatar: "violet" }, { rounds: 1, drawSeconds: 10 });
    const guest = await service.joinGame(host.session.code, { name: "Maya", avatar: "pink" });
    await service.dispatch(guest.session, { type: "SET_READY", ready: true });
    await service.dispatch(host.session, { type: "START_GAME" });
    await advance(PHASE_DURATIONS.STARTING);
    await advance(PHASE_DURATIONS.WHEEL_SPINNING);
    await advance(PHASE_DURATIONS.TARGET_REVEALED);
    await service.dispatch(host.session, { type: "SUBMIT_DRAWING", drawing });
    await service.dispatch(guest.session, { type: "SUBMIT_DRAWING", drawing });
    await advance(10_000);
    await advance(PHASE_DURATIONS.EVALUATING_MIN);
    const { game } = await service.getState(host.session.code);
    expect(game.phase).toBe("ROUND_RESULTS");
    expect(Object.values(game.rounds[0]!.scores).map((s) => s.totalScore)).toEqual([0, 0]);
  });
});
