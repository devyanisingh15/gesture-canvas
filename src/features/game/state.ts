/**
 * The Gesture Canvas game-state model: the one place that defines the phases a
 * game goes through, which moves between them are legal, and how long each
 * timed phase lasts.
 *
 * Everything else follows this file:
 * - the in-memory engine (features/game/engine/stateMachine.ts) applies it;
 * - the database mirrors it (supabase/migrations/20261010040000_game_state_machine.sql:
 *   private.game_transitions and private.phase_ms), and a test checks the two match;
 * - the UI picks a screen per phase (components/screens/GamePhaseScreen.tsx).
 *
 * The server (in-memory service or Postgres) is the only thing that changes a
 * game's phase. Clients render the phase they are given, and at most ask the
 * server to "advance if due"; the server decides what comes next.
 */

export const GAME_PHASES = [
  "LOBBY",
  "STARTING",
  "WHEEL_SPINNING",
  "TARGET_REVEALED",
  "DRAWING",
  "TIME_UP",
  "EVALUATING",
  "ROUND_RESULTS",
  "FINAL_RESULTS",
  "COMPLETED",
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

/**
 * Legal phase transitions. The normal path is
 *   LOBBY → STARTING → [WHEEL_SPINNING → TARGET_REVEALED → DRAWING → TIME_UP → EVALUATING → ROUND_RESULTS] × rounds
 *         → FINAL_RESULTS → COMPLETED
 * plus two escape hatches: a start that loses its players goes back to LOBBY,
 * and a game that drops below two players (or the host ends it) jumps to FINAL_RESULTS.
 */
export const TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  LOBBY: ["STARTING"],
  STARTING: ["WHEEL_SPINNING", "LOBBY", "FINAL_RESULTS"],
  WHEEL_SPINNING: ["TARGET_REVEALED", "FINAL_RESULTS"],
  TARGET_REVEALED: ["DRAWING", "FINAL_RESULTS"],
  DRAWING: ["TIME_UP", "FINAL_RESULTS"],
  TIME_UP: ["EVALUATING", "FINAL_RESULTS"],
  EVALUATING: ["ROUND_RESULTS", "FINAL_RESULTS"],
  ROUND_RESULTS: ["WHEEL_SPINNING", "FINAL_RESULTS"],
  FINAL_RESULTS: ["COMPLETED"],
  COMPLETED: [],
};

/** How long timed phases last (ms). DRAWING uses the game's drawing time instead. */
export const PHASE_DURATIONS = {
  STARTING: 3_000,
  WHEEL_SPINNING: 6_000,
  TARGET_REVEALED: 5_000,
  TIME_UP: 3_000,
  /** Shortest time on the evaluation screen, so its animation can play. */
  EVALUATING_MIN: 4_500,
  /** Longest wait for scores before missing ones count as zero. */
  EVALUATING_MAX: 20_000,
  /** Results auto-advance if the host doesn't press "Next Round". */
  ROUND_RESULTS: 30_000,
  /** Final results stay up this long before the game is marked COMPLETED. */
  FINAL_RESULTS: 60_000,
} as const;

/** MVP game settings: 5 rounds of 45 seconds' drawing, 2 to 6 players. */
export const DEFAULT_ROUNDS = 5;
export const DEFAULT_DRAW_SECONDS = 45;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/**
 * A drawing finished by the deadline still needs a moment to reach the server.
 * It is accepted up to this long after the round's end time (by the server
 * clock), which is also how long TIME_UP lasts. Mirrored by private.submit_grace_ms().
 */
export const SUBMIT_GRACE_MS = 3_000;

/** Phases the host may cut short: end drawing early, or skip the results wait. */
export const HOST_SKIPPABLE: readonly GamePhase[] = ["DRAWING", "ROUND_RESULTS"];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: GamePhase,
    readonly to: GamePhase,
  ) {
    super(`Can't go from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

export function isGamePhase(value: unknown): value is GamePhase {
  return typeof value === "string" && (GAME_PHASES as readonly string[]).includes(value);
}

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: GamePhase, to: GamePhase): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** True once every round has been played: after this round's results come the final results. */
export function isFinalRound(currentRound: number, totalRounds: number): boolean {
  return currentRound >= totalRounds;
}

/** The phase a running game moves to when the current one is over, following the normal path. */
export function nextPhase(phase: GamePhase, currentRound: number, totalRounds: number): GamePhase | null {
  switch (phase) {
    case "LOBBY":
      return "STARTING";
    case "STARTING":
      return "WHEEL_SPINNING";
    case "WHEEL_SPINNING":
      return "TARGET_REVEALED";
    case "TARGET_REVEALED":
      return "DRAWING";
    case "DRAWING":
      return "TIME_UP";
    case "TIME_UP":
      return "EVALUATING";
    case "EVALUATING":
      return "ROUND_RESULTS";
    case "ROUND_RESULTS":
      return isFinalRound(currentRound, totalRounds) ? "FINAL_RESULTS" : "WHEEL_SPINNING";
    case "FINAL_RESULTS":
      return "COMPLETED";
    case "COMPLETED":
      return null;
  }
}

/** How long a phase lasts when entered, or null if it waits for an action (LOBBY) or never ends (COMPLETED). */
export function phaseDurationMs(phase: GamePhase, drawSeconds: number): number | null {
  switch (phase) {
    case "DRAWING":
      return drawSeconds * 1000;
    case "EVALUATING":
      return PHASE_DURATIONS.EVALUATING_MAX;
    case "STARTING":
    case "WHEEL_SPINNING":
    case "TARGET_REVEALED":
    case "TIME_UP":
    case "ROUND_RESULTS":
    case "FINAL_RESULTS":
      return PHASE_DURATIONS[phase];
    case "LOBBY":
    case "COMPLETED":
      return null;
  }
}

/** A game that has started and not yet reached its results. */
export function isInProgress(phase: GamePhase): boolean {
  return phase !== "LOBBY" && phase !== "FINAL_RESULTS" && phase !== "COMPLETED";
}

/** The game is over: final results are showing or it has been closed. */
export function isFinished(phase: GamePhase): boolean {
  return phase === "FINAL_RESULTS" || phase === "COMPLETED";
}
