import type { GamePhase } from "./types";

/**
 * Phase 1 maps each game phase to its own route so every screen can be
 * reviewed in isolation. Phase 4 will drive these from server state.
 */
export const PHASE_ROUTES: Record<GamePhase, string> = {
  LOBBY: "/game/lobby",
  STARTING: "/game/lobby",
  WHEEL_SPINNING: "/game/wheel",
  TARGET_REVEALED: "/game/reveal",
  DRAWING: "/game/draw",
  TIME_UP: "/game/times-up",
  EVALUATING: "/game/evaluating",
  ROUND_RESULTS: "/game/results",
  NEXT_ROUND: "/game/wheel",
  FINAL_RESULTS: "/game/final",
};

export const SCREEN_INDEX = [
  { href: "/", label: "Landing" },
  { href: "/create", label: "Create Game" },
  { href: "/join", label: "Join Game" },
  { href: "/game/lobby", label: "Lobby" },
  { href: "/game/wheel", label: "Wheel Spin" },
  { href: "/game/reveal", label: "Target Reveal" },
  { href: "/game/draw", label: "Gameplay" },
  { href: "/game/times-up", label: "Time's Up" },
  { href: "/game/evaluating", label: "AI Evaluation" },
  { href: "/game/results", label: "Round Results" },
  { href: "/game/final", label: "Final Results" },
  { href: "/game/camera", label: "Camera Permission" },
  { href: "/game/gesture-error", label: "Gesture Detection Error" },
  { href: "/game/disconnected", label: "Player Disconnected" },
] as const;
