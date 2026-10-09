import { PROMPT_ART } from "@/features/game/promptArt";
import type {
  GameRoom,
  LeaderboardEntry,
  PlayerView,
  PlayerRoundResult,
  PromptId,
  ScoreBreakdown,
  Stroke,
} from "@/features/game/types";

/**
 * Mock data for the Phase 1 UI. Phase 4 replaces this with Supabase state;
 * nothing outside src/mocks should construct game data by hand.
 */
export const MOCK_PLAYERS: PlayerView[] = [
  { id: "p1", name: "You", avatar: "violet", isHost: true, isYou: true, isReady: true, connection: "connected" },
  { id: "p2", name: "Maya", avatar: "pink", isHost: false, isYou: false, isReady: true, connection: "connected" },
  { id: "p3", name: "Arjun", avatar: "sun", isHost: false, isYou: false, isReady: true, connection: "connected" },
  { id: "p4", name: "Leo", avatar: "mint", isHost: false, isYou: false, isReady: false, connection: "connected" },
];

export const MOCK_ROOM: GameRoom = {
  code: "PX7K2Q",
  settings: { rounds: 3, drawSeconds: 60, maxPlayers: 6 },
  currentRound: 2,
  phase: "LOBBY",
  players: MOCK_PLAYERS,
  targetPromptId: "rocket",
};

const MOCK_EPOCH = Date.UTC(2026, 9, 9, 16, 0, 0);

/** Deterministic pseudo-random generator so mock drawings don't change between renders. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Builds a wobbly hand-drawn version of a prompt's reference art. */
export function mockStrokes(promptId: PromptId, seed: number, wobble = 2.2, color = "#8b5cf6"): Stroke[] {
  const rand = seeded(seed);
  return PROMPT_ART[promptId].map((line, i) => ({
    id: `s${seed}-${i}`,
    color,
    width: 4,
    points: line.map(([x, y], j) => ({
      x: (x + (rand() - 0.5) * wobble * 2) / 100,
      y: (y + (rand() - 0.5) * wobble * 2) / 100,
      timestamp: MOCK_EPOCH + i * 1000 + j * 40,
    })),
  }));
}

function breakdown(shape: number, structure: number, completeness: number, composition: number): ScoreBreakdown {
  return {
    shapeScore: shape,
    structureScore: structure,
    completenessScore: completeness,
    compositionScore: composition,
    totalScore: Math.round((shape + structure + completeness + composition) / 4),
  };
}

export const MOCK_ROUND_RESULTS: PlayerRoundResult[] = [
  { playerId: "p1", strokes: mockStrokes("rocket", 7, 1.6), score: breakdown(96, 94, 95, 91) },
  { playerId: "p2", strokes: mockStrokes("rocket", 13, 3), score: breakdown(90, 86, 88, 84) },
  { playerId: "p3", strokes: mockStrokes("rocket", 29, 4.5).slice(0, 6), score: breakdown(78, 72, 66, 80) },
  { playerId: "p4", strokes: mockStrokes("rocket", 41, 6).slice(0, 4), score: breakdown(61, 55, 48, 64) },
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { player: MOCK_PLAYERS[0]!, totalScore: 182, lastRoundScore: 94, rank: 1, rankChange: 1 },
  { player: MOCK_PLAYERS[1]!, totalScore: 175, lastRoundScore: 87, rank: 2, rankChange: -1 },
  { player: MOCK_PLAYERS[2]!, totalScore: 151, lastRoundScore: 74, rank: 3, rankChange: 0 },
  { player: MOCK_PLAYERS[3]!, totalScore: 118, lastRoundScore: 57, rank: 4, rankChange: 0 },
];

export const MOCK_FINAL_LEADERBOARD: LeaderboardEntry[] = [
  { player: MOCK_PLAYERS[0]!, totalScore: 271, lastRoundScore: 89, rank: 1, rankChange: 0 },
  { player: MOCK_PLAYERS[1]!, totalScore: 258, lastRoundScore: 83, rank: 2, rankChange: 0 },
  { player: MOCK_PLAYERS[2]!, totalScore: 230, lastRoundScore: 79, rank: 3, rankChange: 0 },
  { player: MOCK_PLAYERS[3]!, totalScore: 181, lastRoundScore: 63, rank: 4, rankChange: 0 },
];

export function findPlayer(id: string): PlayerView {
  const player = MOCK_PLAYERS.find((p) => p.id === id);
  if (!player) throw new Error(`Unknown player: ${id}`);
  return player;
}
