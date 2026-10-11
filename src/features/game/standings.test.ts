import { describe, expect, it } from "vitest";
import { computeStandings } from "./standings";

const players = [
  { id: "c", joinedAt: 1 },
  { id: "a", joinedAt: 2 },
  { id: "b", joinedAt: 3 },
];
const round = (scores: Record<string, number>) => ({ scores: Object.fromEntries(Object.entries(scores).map(([id, totalScore]) => [id, { totalScore }])) });
const table = (s: ReturnType<typeof computeStandings>) => s.map((x) => `${x.playerId}:${x.total}:${x.roundScore}:#${x.rank}:${x.previousRank ?? "-"}`);

describe("computeStandings", () => {
  it("before any round: everyone 0, sharing first place, in join order", () => {
    expect(table(computeStandings({ players, rounds: [] }))).toEqual(["c:0:0:#1:-", "a:0:0:#1:-", "b:0:0:#1:-"]);
  });

  it("one round: ranked by that round's score", () => {
    expect(table(computeStandings({ players, rounds: [round({ a: 92, b: 84, c: 71 })] }))).toEqual(["a:92:92:#1:-", "b:84:84:#2:-", "c:71:71:#3:-"]);
  });

  it("several rounds: totals add up, with each player's latest round and previous rank", () => {
    const rounds = [round({ a: 92, b: 84, c: 71 }), round({ a: 10, b: 50, c: 90 })];
    expect(table(computeStandings({ players, rounds }))).toEqual(["c:161:90:#1:3", "b:134:50:#2:2", "a:102:10:#3:1"]);
  });

  it("ties share a rank and keep a fixed order: earlier joiner first", () => {
    const rounds = [round({ a: 50, b: 80, c: 50 }), round({ a: 40, b: 10, c: 40 })];
    expect(table(computeStandings({ players, rounds }))).toEqual(["c:90:40:#1:2", "a:90:40:#1:2", "b:90:10:#1:1"]);
    const split = [round({ a: 70, b: 70, c: 30 })];
    expect(table(computeStandings({ players, rounds: split }))).toEqual(["a:70:70:#1:-", "b:70:70:#1:-", "c:30:30:#3:-"]);
  });

  it("players who scored nothing (or have no score row) count 0", () => {
    expect(table(computeStandings({ players, rounds: [round({ a: 5 })] }))).toEqual(["a:5:5:#1:-", "c:0:0:#2:-", "b:0:0:#2:-"]);
  });

  it("orders players who joined at the same moment by id", () => {
    const same = [{ id: "y", joinedAt: 1 }, { id: "x", joinedAt: 1 }];
    expect(computeStandings({ players: same, rounds: [round({ x: 1, y: 1 })] }).map((s) => s.playerId)).toEqual(["x", "y"]);
  });
});
