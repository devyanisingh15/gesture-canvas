import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({}) }));
const { parseSnapshot, toEngineGame } = await import("./supabaseGameState");

const raw = {
  server_time: "2026-10-10T12:00:10.000Z",
  game: {
    id: "g1", room_code: "PX7K2Q", status: "ROUND_RESULTS", current_round: 1, total_rounds: 2, draw_seconds: 60,
    phase_started_at: "2026-10-10T12:00:00.000Z", phase_ends_at: "2026-10-10T12:00:30.000Z", state_version: 7,
  },
  players: [
    { id: "p1", display_name: "Maya", is_host: true, joined_at: "2026-10-10T11:59:00.000Z", last_seen_at: "2026-10-10T12:00:00.000Z" },
    { id: "p2", display_name: "Ben", is_host: false, joined_at: "2026-10-10T11:59:30.000Z", last_seen_at: "2026-10-10T12:00:00.000Z" },
  ],
  rounds: [{ id: "r1", round_number: 1, prompt: "cat", status: "COMPLETED", started_at: "2026-10-10T11:58:00.000Z", ends_at: "2026-10-10T11:59:50.000Z" }],
  drawings: [{ round_id: "r1", player_id: "p2", strokes: { version: 1, strokes: [{ id: "s", points: [] }] }, submitted_at: "2026-10-10T11:59:51.000Z" }],
  scores: [{ round_id: "r1", player_id: "p1", score: 40 }, { round_id: "r1", player_id: "p2", score: 70 }],
};

describe("parseSnapshot", () => {
  it("reads the database's game state", () => {
    const s = parseSnapshot(raw)!;
    expect(s.game).toMatchObject({ status: "ROUND_RESULTS", currentRound: 1, totalRounds: 2, version: 7, phaseEndsAt: Date.parse("2026-10-10T12:00:30.000Z") });
    expect(s.serverTime).toBe(Date.parse("2026-10-10T12:00:10.000Z"));
    expect(s.drawings[0]!.drawing.strokes).toHaveLength(1);
  });

  it("returns null for a game the player isn't in", () => {
    expect(parseSnapshot({ server_time: raw.server_time, game: null, players: [], rounds: [], drawings: [], scores: [] })).toBeNull();
  });

  it("refuses a state the app doesn't know", () => {
    expect(() => parseSnapshot({ ...raw, game: { ...raw.game, status: "PAUSED" } })).toThrow();
  });
});

describe("toEngineGame", () => {
  it("renders the database state as the screens' game, with presence", () => {
    const g = toEngineGame(parseSnapshot(raw)!, "p2", new Set(["p1"]), true);
    expect(g).toMatchObject({ phase: "ROUND_RESULTS", hostId: "p1", version: 7, settings: { rounds: 2, drawSeconds: 60 } });
    expect(g.players.map((p) => [p.name, p.connection])).toEqual([["Maya", "connected"], ["Ben", "connected"]]);
    expect(g.rounds[0]!.promptId).toBe("cat");
    expect(g.rounds[0]!.scores.p2!.totalScore).toBe(70);
    expect(Object.keys(g.rounds[0]!.drawings)).toEqual(["p2"]);
  });

  it("shows players without presence as offline", () => {
    const g = toEngineGame(parseSnapshot(raw)!, "p1", new Set(["p1"]), true);
    expect(g.players.find((p) => p.id === "p2")!.connection).toBe("disconnected");
  });
});
