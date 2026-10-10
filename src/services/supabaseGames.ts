"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import type { GameStatus } from "@/lib/supabase/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SupabaseConfigError } from "@/lib/supabase/env";

/** Game and player rows as the lobby reads them (players can't see user_id). */
export interface LobbyGame {
  id: string;
  roomCode: string;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
}

export interface LobbyPlayer {
  id: string;
  displayName: string;
  isHost: boolean;
  joinedAt: string;
}

/** Which game and seat this browser tab holds. */
export interface GameSession {
  gameId: string;
  playerId: string;
  roomCode: string;
}

export type GameRequestErrorKind =
  | "config"
  | "auth"
  | "invalid"
  | "invalid-code"
  | "setup"
  | "network"
  | "not-found"
  | "started"
  | "full"
  | "name-taken"
  | "unknown";

export class GameRequestError extends Error {
  constructor(
    readonly kind: GameRequestErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GameRequestError";
  }

  /** Worth offering a retry button. */
  get retryable(): boolean {
    return this.kind === "network" || this.kind === "unknown";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

function client() {
  try {
    return getSupabaseBrowserClient();
  } catch (e) {
    if (e instanceof SupabaseConfigError) throw new GameRequestError("config", "The game server isn't configured. Check the Supabase settings in .env.local.");
    throw e;
  }
}

function toRequestError(error: PostgrestError | Error | null | undefined, fallback: string): GameRequestError {
  if (!error) return new GameRequestError("unknown", fallback);
  if (error instanceof GameRequestError) return error;
  const code = "code" in error ? error.code : undefined;
  const message = error.message ?? "";
  if (error.name === "AbortError" || /abort|timeout/i.test(message)) {
    return new GameRequestError("network", "The game server took too long to answer.");
  }
  if (/fetch|network|Failed to/i.test(message) && !code) {
    return new GameRequestError("network", "Can't reach the game server. Check your connection.");
  }
  if (code === "22023") {
    return /room code/i.test(message)
      ? new GameRequestError("invalid-code", "That isn't a valid room code. Codes are 6 letters and numbers, like PX7K2Q.")
      : new GameRequestError("invalid", message);
  }
  // Raised by join_game (see supabase/migrations/20261010020000_join_game_function.sql).
  if (code === "GC001") return new GameRequestError("not-found", "We couldn't find a game with that code. Check it with your host.");
  if (code === "GC002") return new GameRequestError("started", "This game has already started. Ask your host to start a new one.");
  if (code === "GC003") return new GameRequestError("full", "This game is full (6 players).");
  if (code === "GC004") return new GameRequestError("name-taken", "Someone in this game already has that name. Pick another.");
  if (code === "28000" || code === "42501") return new GameRequestError("auth", "You need to be signed in to do that.");
  if (code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01") {
    return new GameRequestError("setup", "The game database isn't set up yet. Apply the Supabase migrations and try again.");
  }
  return new GameRequestError("unknown", fallback);
}

/** Runs a request, turning anything it throws (network failure, timeout) into a GameRequestError. */
async function guard<T>(request: () => PromiseLike<T>, fallback: string): Promise<T> {
  try {
    return await request();
  } catch (e) {
    throw toRequestError(e instanceof Error ? e : null, fallback);
  }
}

/** Every player is an anonymous Supabase user; sign in once per browser. */
async function ensureSignedIn(): Promise<void> {
  const supabase = client();
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (!error) return;
  if (/anonymous sign-ins are disabled/i.test(error.message)) {
    throw new GameRequestError("setup", "Guest sign-in is turned off for this project. Enable anonymous sign-ins in Supabase (Authentication → Sign In / Providers).");
  }
  throw toRequestError(error, "Couldn't sign you in. Try again.");
}

/**
 * Creates a game in LOBBY with this browser as host. The database function
 * picks a unique room code and treats a double-submit as the same request.
 */
export async function createGame(input: { displayName: string; totalRounds: number }): Promise<GameSession> {
  const fallback = "Couldn't create the game. Try again.";
  const { data, error } = await guard(async () => {
    await ensureSignedIn();
    return client()
      .rpc("create_game", { p_display_name: input.displayName.trim(), p_total_rounds: input.totalRounds })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  }, fallback);
  if (error) throw toRequestError(error, fallback);
  const row = data?.[0];
  if (!row) throw new GameRequestError("unknown", "Couldn't create the game. Try again.");
  return { gameId: row.game_id, playerId: row.player_id, roomCode: row.room_code };
}

/** Trims, upper-cases and checks a room code typed by a player. Returns null if it can't be one. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}

/**
 * Takes a seat in a game that's still in the lobby. The database function
 * checks the room under a lock (exists, in LOBBY, under 6 players, name free)
 * and returns the caller's existing seat if they're already in it.
 */
export async function joinGame(input: { roomCode: string; displayName: string }): Promise<GameSession> {
  const roomCode = normalizeRoomCode(input.roomCode);
  if (!roomCode) throw new GameRequestError("invalid-code", "That isn't a valid room code. Codes are 6 letters and numbers, like PX7K2Q.");
  const fallback = "Couldn't join the game. Try again.";
  const { data, error } = await guard(async () => {
    await ensureSignedIn();
    return client()
      .rpc("join_game", { p_room_code: roomCode, p_display_name: input.displayName.trim() })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  }, fallback);
  if (error) throw toRequestError(error, fallback);
  const row = data?.[0];
  if (!row) throw new GameRequestError("unknown", fallback);
  return { gameId: row.game_id, playerId: row.player_id, roomCode: row.room_code };
}

/** The game and its players, as this player is allowed to see them. */
export async function fetchLobby(gameId: string): Promise<{ game: LobbyGame; players: LobbyPlayer[] }> {
  const supabase = client();
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const [gameRes, playersRes] = await guard(
    () =>
      Promise.all([
        supabase.from("games").select("id, room_code, status, current_round, total_rounds").eq("id", gameId).abortSignal(signal).maybeSingle(),
        supabase.from("players").select("id, display_name, is_host, joined_at").eq("game_id", gameId).order("joined_at").abortSignal(signal),
      ]),
    "Couldn't load the game.",
  );
  if (gameRes.error) throw toRequestError(gameRes.error, "Couldn't load the game.");
  if (playersRes.error) throw toRequestError(playersRes.error, "Couldn't load the players.");
  if (!gameRes.data) throw new GameRequestError("not-found", "This game doesn't exist or you're not in it.");
  const g = gameRes.data;
  return {
    game: { id: g.id, roomCode: g.room_code, status: g.status, currentRound: g.current_round, totalRounds: g.total_rounds },
    players: playersRes.data.map((p) => ({ id: p.id, displayName: p.display_name, isHost: p.is_host, joinedAt: p.joined_at })),
  };
}

// ---------------------------------------------------------------------------
// Session: per tab, keyed by room code. The Supabase auth session itself is
// kept by the Supabase client.

const sessionKey = (roomCode: string) => `gesture-canvas:game:${roomCode.toUpperCase()}`;

export function saveGameSession(session: GameSession): void {
  try {
    sessionStorage.setItem(sessionKey(session.roomCode), JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode): the lobby will ask the player to rejoin.
  }
}

export function loadGameSession(roomCode: string): GameSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(roomCode));
    const s = raw ? (JSON.parse(raw) as Partial<GameSession>) : null;
    return s && typeof s.gameId === "string" && typeof s.playerId === "string" && typeof s.roomCode === "string"
      ? (s as GameSession)
      : null;
  } catch {
    return null;
  }
}
