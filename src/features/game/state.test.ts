import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPTS } from "./prompts";
import {
  assertTransition,
  canTransition,
  GAME_PHASES,
  InvalidTransitionError,
  isFinalRound,
  nextPhase,
  PHASE_DURATIONS,
  phaseDurationMs,
  TRANSITIONS,
  type GamePhase,
} from "./state";

const migration = readFileSync(new URL("../../../supabase/migrations/20261010040000_game_state_machine.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../../supabase/migrations/20261010000000_initial_schema.sql", import.meta.url), "utf8");

describe("transitions", () => {
  it("allows the normal path and nothing arbitrary", () => {
    expect(canTransition("LOBBY", "STARTING")).toBe(true);
    expect(canTransition("ROUND_RESULTS", "WHEEL_SPINNING")).toBe(true);
    expect(canTransition("FINAL_RESULTS", "COMPLETED")).toBe(true);
    expect(canTransition("LOBBY", "DRAWING")).toBe(false);
    expect(canTransition("DRAWING", "WHEEL_SPINNING")).toBe(false);
    expect(canTransition("COMPLETED", "LOBBY")).toBe(false);
    expect(() => assertTransition("TIME_UP", "DRAWING")).toThrow(InvalidTransitionError);
  });

  it("nextPhase only ever names a legal transition", () => {
    for (const phase of GAME_PHASES) {
      for (const [current, total] of [[1, 3], [3, 3]] as const) {
        const next = nextPhase(phase, current, total);
        if (next) expect(canTransition(phase, next), `${phase} → ${next}`).toBe(true);
        else expect(phase).toBe("COMPLETED");
      }
    }
  });

  it("walks a 2-round game from LOBBY to COMPLETED", () => {
    const path: GamePhase[] = [];
    let phase: GamePhase | null = "LOBBY";
    let round = 0;
    while (phase) {
      path.push(phase);
      phase = nextPhase(phase, round, 2);
      if (phase === "WHEEL_SPINNING") round++;
    }
    const roundPath = ["WHEEL_SPINNING", "TARGET_REVEALED", "DRAWING", "TIME_UP", "EVALUATING", "ROUND_RESULTS"];
    expect(path).toEqual(["LOBBY", "STARTING", ...roundPath, ...roundPath, "FINAL_RESULTS", "COMPLETED"]);
  });

  it("detects the final round", () => {
    expect(isFinalRound(2, 3)).toBe(false);
    expect(isFinalRound(3, 3)).toBe(true);
  });

  it("knows how long each phase lasts", () => {
    expect(phaseDurationMs("DRAWING", 45)).toBe(45_000);
    expect(phaseDurationMs("EVALUATING", 60)).toBe(PHASE_DURATIONS.EVALUATING_MAX);
    expect(phaseDurationMs("LOBBY", 60)).toBeNull();
    expect(phaseDurationMs("COMPLETED", 60)).toBeNull();
  });
});

describe("the database mirrors this model", () => {
  it("has the same phases", () => {
    const list = /status in \(([^)]*'LOBBY'[^)]*)\)/s.exec(schema)![1]!;
    expect([...list.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])).toEqual([...GAME_PHASES]);
  });

  it("has the same transition table", () => {
    const values = /insert into private\.game_transitions[^;]*;/s.exec(migration)![0];
    const sql = [...values.matchAll(/\('([A-Z_]+)', '([A-Z_]+)'\)/g)].map((m) => `${m[1]}→${m[2]}`).sort();
    const ts = Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}→${to}`)).sort();
    expect(sql).toEqual(ts);
  });

  it("has the same phase lengths", () => {
    const body = /create function private\.phase_ms[\s\S]*?\$\$;/.exec(migration)![0];
    const sql = Object.fromEntries([...body.matchAll(/when '([A-Z_]+)'\s+then (\d+)/g)].map((m) => [m[1], Number(m[2])]));
    expect(sql).toEqual({ ...PHASE_DURATIONS });
  });

  it("picks round prompts from the same list", () => {
    const list = /unnest\(array\[([^\]]*)\]\)/.exec(migration)![1]!;
    expect([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual(PROMPTS.map((p) => p.id));
  });
});
