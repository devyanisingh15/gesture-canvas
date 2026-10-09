import type { Stroke } from "@/features/drawing/types";

/** Server-authoritative game phases, in order. See features/game/engine/stateMachine.ts. */
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
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

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

export interface ScoreBreakdown {
  shapeScore: number;
  structureScore: number;
  completenessScore: number;
  compositionScore: number;
  totalScore: number;
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
