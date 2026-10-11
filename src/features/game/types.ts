import type { Stroke } from "@/features/drawing/types";

export { GAME_PHASES, type GamePhase } from "./state";
import type { GamePhase } from "./state";

export type PromptId =
  | "house"
  | "tree"
  | "sun"
  | "car"
  | "fish"
  | "cat"
  | "rocket"
  | "flower"
  | "guitar"
  | "airplane";

export interface DrawingPrompt {
  id: PromptId;
  label: string;
  emoji: string;
  hint: string;
}

export type AvatarColor = "violet" | "pink" | "sun" | "mint" | "sky" | "peach";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

/** A player as the UI shows them (relative to the viewer). Engine state lives in engine/types.ts. */
export interface PlayerView {
  id: string;
  name: string;
  avatar: AvatarColor;
  isHost: boolean;
  isYou: boolean;
  isReady: boolean;
  connection: ConnectionStatus;
}

export type { Drawing, Point, Stroke } from "@/features/drawing/types";

/** A player's score for a round, as the evaluator gave it (each part 0–100). */
export interface ScoreBreakdown {
  structureScore: number;
  completenessScore: number;
  compositionScore: number;
  totalScore: number;
  /** The evaluator's one-line note, when it gave one. */
  feedback?: string;
}

export interface PlayerRoundResult {
  playerId: string;
  strokes: Stroke[];
  score: ScoreBreakdown;
}

export interface GameSettings {
  rounds: number;
  drawSeconds: number;
  maxPlayers: number;
}

export interface GameRoom {
  code: string;
  settings: GameSettings;
  currentRound: number;
  phase: GamePhase;
  players: PlayerView[];
  targetPromptId: PromptId;
}

export interface LeaderboardEntry {
  player: PlayerView;
  totalScore: number;
  lastRoundScore: number;
  rank: number;
  rankChange: number;
}

export type GestureStatus = "starting" | "detected" | "not-detected" | "drawing";
