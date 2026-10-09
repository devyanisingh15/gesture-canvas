/** Server-authoritative game phases (see the Phase 5 state machine). */
export const GAME_PHASES = [
  "LOBBY",
  "STARTING",
  "WHEEL_SPINNING",
  "TARGET_REVEALED",
  "DRAWING",
  "TIME_UP",
  "EVALUATING",
  "ROUND_RESULTS",
  "NEXT_ROUND",
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

export interface Player {
  id: string;
  name: string;
  avatar: AvatarColor;
  isHost: boolean;
  isYou: boolean;
  isReady: boolean;
  connection: ConnectionStatus;
}

/** A point on the canvas, normalized to 0..1 so drawings render at any size. */
export interface StrokePoint {
  x: number;
  y: number;
  t: number;
}

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: StrokePoint[];
}

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
  players: Player[];
  targetPromptId: PromptId;
}

export interface LeaderboardEntry {
  player: Player;
  totalScore: number;
  lastRoundScore: number;
  rank: number;
  rankChange: number;
}

export type GestureStatus = "starting" | "detected" | "not-detected" | "drawing";
