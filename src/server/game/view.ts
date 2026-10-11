import { currentRound } from "@/features/game/engine/stateMachine";
import type { Game, GameState, Round } from "@/features/game/engine/types";
import { computeStandings } from "@/features/game/standings";

const RESULTS_PHASES = new Set<Game["phase"]>(["ROUND_RESULTS", "FINAL_RESULTS", "COMPLETED"]);

/** A round's drawings and scores are revealed once its results are showing. */
export function isRevealed(game: Game, round: Round): boolean {
  return round !== currentRound(game) || RESULTS_PHASES.has(game.phase);
}

/**
 * The game as one player may see it, with the leaderboard. Until a round's
 * results are showing, other players' drawings are blank and nobody's score
 * is sent; the viewer keeps their own drawing (to show it after a refresh).
 * `viewerId` null (not signed in to the game) sees no unrevealed drawings.
 */
export function viewFor(game: Game, viewerId: string | null, serverTime: number): GameState {
  const rounds = game.rounds.map((round): Round => {
    if (isRevealed(game, round)) return round;
    const drawings: Round["drawings"] = {};
    for (const [id, d] of Object.entries(round.drawings)) drawings[id] = id === viewerId ? d : { ...d, drawing: { strokes: [] } };
    return { ...round, drawings, scores: {} };
  });
  const standings = computeStandings({ players: game.players, rounds: game.rounds.filter((r) => isRevealed(game, r)) });
  return { game: { ...game, rounds, standings }, serverTime };
}
