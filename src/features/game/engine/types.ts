/**
 * Authoritative game model. The server (today an in-memory service, later
 * Supabase/Postgres) owns these objects; clients only ever receive a
 * GameState snapshot and send GameCommands.
 */
import type { Drawing } from "@/features/drawing/types";
import type { AvatarColor, ConnectionStatus, GamePhase, PromptId, ScoreBreakdown } from "../types";

export type { Drawing, GamePhase };

export interface GameSettings {
  rounds: number;
  drawSeconds: number;
  maxPlayers: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: AvatarColor;
  isHost: boolean;
  isReady: boolean;
  connection: ConnectionStatus;
  joinedAt: number;
}

export interface SubmittedDrawing {
  playerId: string;
  drawing: Drawing;
  submittedAt: number;
}

export interface Score extends ScoreBreakdown {
  playerId: string;
  roundNumber: number;
}

export interface Round {
  /** 1-based. */
  number: number;
  promptId: PromptId;
  startedAt: number;
  /** When drawing started and must end; set on entering DRAWING. */
  drawingStartedAt: number | null;
  drawingEndsAt: number | null;
  drawings: Record<string, SubmittedDrawing>;
  scores: Record<string, Score>;
}

export interface Game {
  id: string;
  /** Six-character join code, e.g. "PX7K2Q". */
  code: string;
  hostId: string;
  settings: GameSettings;
  phase: GamePhase;
  phaseStartedAt: number;
  /** When the current phase ends on its own, or null if it waits for an action. */
  phaseEndsAt: number | null;
  players: Player[];
  rounds: Round[];
  /** Prompts already used this game, so they don't repeat until the list runs out. */
  usedPromptIds: PromptId[];
  createdAt: number;
  updatedAt: number;
  /** Increments on every change; clients ignore stale snapshots. */
  version: number;
}

/** What clients receive: the game plus the server clock, for countdowns. */
export interface GameState {
  game: Game;
  serverTime: number;
}

export interface JoinInput {
  name: string;
  avatar: AvatarColor;
}

/** Commands a player can send. The engine decides whether each is allowed. */
export type GameCommand =
  | { type: "SET_READY"; playerId: string; ready: boolean }
  | { type: "START_GAME"; playerId: string }
  | { type: "SUBMIT_DRAWING"; playerId: string; drawing: Drawing }
  | { type: "END_ROUND"; playerId: string }
  | { type: "NEXT_ROUND"; playerId: string }
  | { type: "END_GAME"; playerId: string }
  | { type: "LEAVE"; playerId: string };

/** Events only the server itself raises. */
export type SystemEvent =
  | { type: "TICK" }
  | { type: "SET_CONNECTION"; playerId: string; connection: ConnectionStatus }
  | { type: "SCORES_READY"; roundNumber: number; scores: Score[] };

export type GameEvent = GameCommand | SystemEvent;

export type GameErrorCode =
  | "GAME_NOT_FOUND"
  | "GAME_FULL"
  | "GAME_IN_PROGRESS"
  | "NAME_TAKEN"
  | "INVALID_INPUT"
  | "UNKNOWN_PLAYER"
  | "NOT_HOST"
  | "WRONG_PHASE"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYERS_NOT_READY"
  | "ALREADY_SUBMITTED"
  | "UNAUTHORIZED";

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}

/** Randomness and time are injected so the engine is deterministic in tests. */
export interface EngineContext {
  now: number;
  random: () => number;
}
