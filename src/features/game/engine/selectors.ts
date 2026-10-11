/** Read-only views of a Game for the UI. */
import { getPrompt } from "../prompts";
import type { DrawingPrompt, GameRoom, LeaderboardEntry, PlayerRoundResult, PlayerView } from "../types";
import { isFinalRound } from "../state";
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

/**
 * The leaderboard as the server sent it (game.standings: totals, ranks and ties
 * worked out by the database or the game server, never here), in its order.
 */
export function leaderboard(game: Game, meId: string | null): LeaderboardEntry[] {
  const byId = new Map(game.players.map((p) => [p.id, p]));
  const standings = game.standings ?? game.players.map((p) => ({ playerId: p.id, total: 0, roundScore: 0, rank: 1, previousRank: null }));
  return standings.flatMap((s) => {
    const player = byId.get(s.playerId);
    if (!player) return [];
    return [{
      player: toPlayerView(player, meId),
      totalScore: s.total,
      lastRoundScore: s.roundScore,
      rank: s.rank,
      rankChange: s.previousRank === null ? 0 : s.previousRank - s.rank,
    }];
  });
}

/** Each player's drawing and score for a round, as the results screens show them. */
export function roundResults(game: Game, round: Round): PlayerRoundResult[] {
  return game.players.map((p) => ({
    playerId: p.id,
    strokes: round.drawings[p.id]?.drawing.strokes ?? [],
    score: round.scores[p.id] ?? { structureScore: 0, completenessScore: 0, compositionScore: 0, totalScore: 0 },
  }));
}

export function isLastRound(game: Game): boolean {
  return isFinalRound(game.rounds.length, game.settings.rounds);
}
