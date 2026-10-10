import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPTS } from "./prompts";
import { PHASE_DURATIONS } from "./state";
import { landingRotation, promptAtRotation, SPIN_MS, spinElapsedMs } from "./wheel";

describe("prompt wheel", () => {
  it("lands on the prompt the server picked, for every prompt", () => {
    for (const p of PROMPTS) expect(promptAtRotation(landingRotation(p.id))).toBe(p.id);
  });

  it("lands in the middle of the segment, after several full turns", () => {
    const slice = 360 / PROMPTS.length;
    for (const p of PROMPTS) {
      const r = landingRotation(p.id);
      expect(r).toBeGreaterThan(360 * 5);
      expect(promptAtRotation(r + slice / 2 - 0.01)).toBe(p.id);
      expect(promptAtRotation(r - slice / 2 + 0.01)).toBe(p.id);
    }
  });

  it("finishes spinning before the server reveals the prompt", () => {
    expect(SPIN_MS).toBeLessThan(PHASE_DURATIONS.WHEEL_SPINNING);
  });

  it("measures late arrivals from the server's spin start", () => {
    expect(spinElapsedMs(10_000, 12_500)).toBe(2_500);
    // A client clock slightly behind the server's never counts as negative.
    expect(spinElapsedMs(10_000, 9_900)).toBe(0);
  });

  it("uses the same prompts the database accepts in rounds.prompt", () => {
    const schema = readFileSync("supabase/migrations/20261010000000_initial_schema.sql", "utf8");
    const check = /prompt\s+text not null check \(prompt in \(([^)]*)\)/.exec(schema)![1]!;
    expect([...check.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual(PROMPTS.map((p) => p.id));
  });
});
