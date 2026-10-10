"use client";

import type { Drawing } from "@/features/drawing/types";
import type { Game, Player, Round, Score } from "@/features/game/engine/types";
import { PROMPTS } from "@/features/game/prompts";
import { isGamePhase, type GamePhase } from "@/features/game/state";
import type { AvatarColor, PromptId } from "@/features/game/types";
import type { Json } from "@/lib/supabase/database.types";
import { client, GameRequestError, guard, REQUEST_TIMEOUT_MS, toRequestError } from "./supabaseGames";

/**
 * Reads and moves a game whose state lives in Postgres. The database is the
 * authority (see supabase/migrations/20261010040000_game_state_machine.sql):
 * this module never picks a phase, it only asks the database to move on.
 */

/** One consistent read of a game, as public.get_game_state returns it. */
export interface GameSnapshot {
  /** Database clock when the snapshot was taken (ms). */
  serverTime: number;
  game: {
    id: string;
    roomCode: string;
    status: GamePhase;
    currentRound: number;
    totalRounds: number;
    drawSeconds: number;
    phaseStartedAt: number;
    phaseEndsAt: number | null;
    version: number;
  };
  players: { id: string; displayName: string; isHost: boolean; joinedAt: number; lastSeenAt: number }[];
  rounds: { id: string; number: number; prompt: PromptId; status: string; startedAt: number; endsAt: number | null }[];
  /** Only the drawings this player may see: their own, and everyone's once a round is complete. */
  drawings: { roundId: string; playerId: string; drawing: Drawing; submittedAt: number }[];
  /** Visible once a round is complete. */
  scores: { roundId: string; playerId: string; score: number }[];
}

// The schema has no seat-limit column; this matches the app's limit.
const MAX_PLAYERS = 6;
const AVATARS: AvatarColor[] = ["violet", "pink", "sun", "mint", "sky", "peach"];
const PROMPT_IDS = new Set<string>(PROMPTS.map((p) => p.id));

const ms = (iso: unknown): number => (typeof iso === "string" ? Date.parse(iso) : NaN);
const msOrNull = (iso: unknown): number | null => (iso == null ? null : ms(iso));
type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

/** Checks the database's answer has the shape the app relies on. Throws if not. */
export function parseSnapshot(raw: Json): GameSnapshot | null {
  const s = raw as Row | null;
  if (!s || s.game == null) return null;
  const g = s.game as Row;
  if (!isGamePhase(g.status)) throw new GameRequestError("unknown", "The game server sent a state this app doesn't know.");
  return {
    serverTime: ms(s.server_time),
    game: {
      id: String(g.id),
      roomCode: String(g.room_code),
      status: g.status,
      currentRound: Number(g.current_round),
      totalRounds: Number(g.total_rounds),
      drawSeconds: Number(g.draw_seconds),
      phaseStartedAt: ms(g.phase_started_at),
      phaseEndsAt: msOrNull(g.phase_ends_at),
      version: Number(g.state_version),
    },
    players: rows(s.players).map((p) => ({
      id: String(p.id),
      displayName: String(p.display_name),
      isHost: p.is_host === true,
      joinedAt: ms(p.joined_at),
      lastSeenAt: ms(p.last_seen_at),
    })),
    rounds: rows(s.rounds)
      .filter((r) => PROMPT_IDS.has(String(r.prompt)))
      .map((r) => ({
        id: String(r.id),
        number: Number(r.round_number),
        prompt: r.prompt as PromptId,
        status: String(r.status),
        startedAt: ms(r.started_at),
        endsAt: msOrNull(r.ends_at),
      })),
    drawings: rows(s.drawings).map((d) => {
      const strokes = (d.strokes as { strokes?: unknown } | null)?.strokes;
      return {
        roundId: String(d.round_id),
        playerId: String(d.player_id),
        drawing: { strokes: Array.isArray(strokes) ? (strokes as Drawing["strokes"]) : [] },
        submittedAt: ms(d.submitted_at),
      };
    }),
    scores: rows(s.scores).map((x) => ({ roundId: String(x.round_id), playerId: String(x.player_id), score: Number(x.score) })),
  };
}

/** A stable colour per player, so colours don't shuffle when someone leaves. */
export function avatarFor(id: string): AvatarColor {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

/**
 * The snapshot in the shape the game screens render (the engine's Game), so the
 * Supabase room and the in-memory room share every screen.
 * `online` is who has the game open (Realtime Presence); null before the first sync.
 */
export function toEngineGame(snap: GameSnapshot, meId: string, online: ReadonlySet<string> | null, linkUp: boolean): Game {
  const { game } = snap;
  const players: Player[] = snap.players.map((p) => {
    // Until the first presence sync, assume everyone is here rather than flashing "Offline".
    const connected = p.id === meId ? linkUp : online === null || online.has(p.id);
    return {
      id: p.id,
      name: p.displayName,
      avatar: avatarFor(p.id),
      isHost: p.isHost,
      // There's no ready-up step yet: a player with the game open counts as ready.
      isReady: connected,
      connection: connected ? "connected" : "disconnected",
      joinedAt: p.joinedAt,
    };
  });
  const rounds: Round[] = snap.rounds.map((r) => {
    const drawings: Round["drawings"] = {};
    for (const d of snap.drawings) if (d.roundId === r.id) drawings[d.playerId] = { playerId: d.playerId, drawing: d.drawing, submittedAt: d.submittedAt };
    const scores: Round["scores"] = {};
    for (const s of snap.scores) {
      if (s.roundId !== r.id) continue;
      // The database keeps one total per player per round; the breakdown isn't stored yet.
      const score: Score = { playerId: s.playerId, roundNumber: r.number, totalScore: s.score, shapeScore: s.score, structureScore: s.score, completenessScore: s.score, compositionScore: s.score };
      scores[s.playerId] = score;
    }
    const drawingEndsAt = r.status === "SPINNING" || r.status === "REVEALED" ? null : r.endsAt;
    return {
      number: r.number,
      promptId: r.prompt,
      startedAt: r.startedAt,
      drawingStartedAt: drawingEndsAt === null ? null : drawingEndsAt - game.drawSeconds * 1000,
      drawingEndsAt,
      drawings,
      scores,
    };
  });
  return {
    id: game.id,
    code: game.roomCode,
    hostId: snap.players.find((p) => p.isHost)?.id ?? "",
    settings: { rounds: game.totalRounds, drawSeconds: game.drawSeconds, maxPlayers: MAX_PLAYERS },
    phase: game.status,
    phaseStartedAt: game.phaseStartedAt,
    phaseEndsAt: game.phaseEndsAt,
    players,
    rounds,
    usedPromptIds: rounds.map((r) => r.promptId),
    createdAt: game.phaseStartedAt,
    updatedAt: game.phaseStartedAt,
    version: game.version,
  };
}

export async function fetchGameState(gameId: string): Promise<GameSnapshot | null> {
  const fallback = "Couldn't load the game.";
  const { data, error } = await guard(
    async () => client().rpc("get_game_state", { p_game_id: gameId }).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    fallback,
  );
  if (error) throw toRequestError(error, fallback);
  return parseSnapshot(data);
}

export interface AdvanceResult {
  /** This call moved the game on (only one caller can, per step). */
  advanced: boolean;
  /** The game's version afterwards. Different from the one sent: someone moved it. */
  version: number;
}

async function advance(fn: "advance_game" | "host_advance", gameId: string, version: number): Promise<AdvanceResult> {
  const fallback = "Couldn't reach the game server.";
  const { data, error } = await guard(
    async () =>
      client().rpc(fn, { p_game_id: gameId, p_expected_version: version }).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    fallback,
  );
  if (error) throw toRequestError(error, fallback);
  const row = data?.[0];
  return { advanced: row?.advanced === true, version: row?.state_version ?? version };
}

/** "The current phase is over": the database moves on only if its end time has passed. */
export const advanceGame = (gameId: string, version: number) => advance("advance_game", gameId, version);

/** Host: end drawing now, or go on from the results. The database refuses anyone else. */
export const hostAdvance = (gameId: string, version: number) => advance("host_advance", gameId, version);

/** Hands in this player's drawing for a round. RLS only accepts it while the round is open. */
export async function submitDrawing(roundId: string, playerId: string, drawing: Drawing): Promise<void> {
  const fallback = "Couldn't hand in your drawing.";
  const { error } = await guard(
    async () =>
      client()
        .from("drawings")
        .insert({ round_id: roundId, player_id: playerId, strokes: { version: 1, strokes: drawing.strokes } as unknown as Json })
        .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    fallback,
  );
  if (error) throw toRequestError(error, fallback);
}
