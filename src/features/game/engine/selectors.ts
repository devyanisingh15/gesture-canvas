/** Read-only views of a Game for the UI. */
import { getPrompt } from "../prompts";
import type { DrawingPrompt, GameRoom, LeaderboardEntry, PlayerRoundResult, PlayerView } from "../types";
import { currentRound } from "./stateMachine";
import type { Game, Player, Round } from "./types";

export { currentRound };

export function toPlayerView(player: Player, meId: string | null): PlayerView {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    isHost: player.isHost,
    isYou: player.id === meId,
    isReady: player.isReady,
    connection: player.connection,
  };
}

export function playerViews(game: Game, meId: string | null): PlayerView[] {
  return game.players.map((p) => toPlayerView(p, meId));
}

/** The room summary the lobby and header components take. */
export function toGameRoom(game: Game, meId: string | null): GameRoom {
  const round = currentRound(game);
  return {
    code: game.code,
    settings: game.settings,
    currentRound: round?.number ?? 0,
    phase: game.phase,
    players: playerViews(game, meId),
    targetPromptId: round?.promptId ?? "house",
  };
}

export function currentPrompt(game: Game): DrawingPrompt | null {
  const round = currentRound(game);
  return round ? getPrompt(round.promptId) : null;
}

/** Milliseconds left in the current phase, using the server clock offset. */
export function phaseRemainingMs(game: Game, now: number): number | null {
  return game.phaseEndsAt === null ? null : Math.max(0, game.phaseEndsAt - now);
}

function totalsThrough(game: Game, rounds: Round[]): Map<string, number> {
  const totals = new Map(game.players.map((p) => [p.id, 0]));
  for (const r of rounds) for (const s of Object.values(r.scores)) totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + s.totalScore);
  return totals;
}

function rank(game: Game, totals: Map<string, number>): Map<string, number> {
  const sorted = [...game.players].sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.joinedAt - b.joinedAt);
  const ranks = new Map<string, number>();
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    // Ties share a rank.
    ranks.set(p.id, prev && totals.get(prev.id) === totals.get(p.id) ? ranks.get(prev.id)! : i + 1);
  });
  return ranks;
}

/** Leaderboard after the scored rounds, with rank change since the previous round. */
export function leaderboard(game: Game, meId: string | null): LeaderboardEntry[] {
  const scored = game.rounds.filter((r) => Object.keys(r.scores).length > 0);
  const totals = totalsThrough(game, scored);
  const before = rank(game, totalsThrough(game, scored.slice(0, -1)));
  const ranks = rank(game, totals);
  const last = scored[scored.length - 1];
  return game.players
    .map((p) => ({
      player: toPlayerView(p, meId),
      totalScore: totals.get(p.id) ?? 0,
      lastRoundScore: last?.scores[p.id]?.totalScore ?? 0,
      rank: ranks.get(p.id)!,
      rankChange: scored.length > 1 ? before.get(p.id)! - ranks.get(p.id)! : 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.player.name.localeCompare(b.player.name));
}

/** Each player's drawing and score for a round, as the results screens show them. */
export function roundResults(game: Game, round: Round): PlayerRoundResult[] {
  return game.players.map((p) => ({
    playerId: p.id,
    strokes: round.drawings[p.id]?.drawing.strokes ?? [],
    score: round.scores[p.id] ?? { shapeScore: 0, structureScore: 0, completenessScore: 0, compositionScore: 0, totalScore: 0 },
  }));
}

export function isLastRound(game: Game): boolean {
  return game.rounds.length >= game.settings.rounds;
}
