/**
 * The leaderboard, as the server works it out. Supabase games get it from the
 * database (public.get_standings); the in-memory server uses computeStandings,
 * which follows the same rules. Browsers only display it.
 *
 * Only revealed rounds count (Supabase: COMPLETED; in memory: rounds whose
 * results are showing or past). Ties share a rank (1, 1, 3), and among them
 * the earlier joiner comes first, then the lower player id, so the same scores
 * always give the same order.
 */
export interface Standing {
  playerId: string;
  /** Sum of the player's scores over the counted rounds. */
  total: number;
  /** Their score in the latest counted round. */
  roundScore: number;
  /** 1 is first; players with the same total share a rank. */
  rank: number;
  /** Rank before the latest counted round, or null when only one round counts. */
  previousRank: number | null;
}

interface StandingsInput {
  players: readonly { id: string; joinedAt: number }[];
  /** The rounds that count, oldest first, with each player's total score. */
  rounds: readonly { scores: Record<string, { totalScore: number }> }[];
}

export function computeStandings({ players, rounds }: StandingsInput): Standing[] {
  const sum = (id: string, upTo: number) => rounds.slice(0, upTo).reduce((n, r) => n + (r.scores[id]?.totalScore ?? 0), 0);
  const rows = players.map((p, order) => ({
    p,
    order,
    total: sum(p.id, rounds.length),
    before: sum(p.id, rounds.length - 1),
    roundScore: rounds.at(-1)?.scores[p.id]?.totalScore ?? 0,
  }));
  const rankBy = (key: "total" | "before", id: string) => 1 + rows.filter((r) => r[key] > rows.find((x) => x.p.id === id)![key]).length;
  return rows
    .sort((a, b) => b.total - a.total || a.p.joinedAt - b.p.joinedAt || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
    .map((r) => ({
      playerId: r.p.id,
      total: r.total,
      roundScore: r.roundScore,
      rank: rankBy("total", r.p.id),
      previousRank: rounds.length > 1 ? rankBy("before", r.p.id) : null,
    }));
}
