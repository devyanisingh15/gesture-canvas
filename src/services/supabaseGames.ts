"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SupabaseConfigError } from "@/lib/supabase/env";

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
  | "not-member"
  | "not-host"
  | "not-enough-players"
  | "wrong-phase"
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

export const REQUEST_TIMEOUT_MS = 10_000;

export function client() {
  try {
    return getSupabaseBrowserClient();
  } catch (e) {
    if (e instanceof SupabaseConfigError) throw new GameRequestError("config", "The game server isn't configured. Check the Supabase settings in .env.local.");
    throw e;
  }
}

export function toRequestError(error: PostgrestError | Error | null | undefined, fallback: string): GameRequestError {
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
  // Raised by the lobby functions (see supabase/migrations/20261010030000_lobby_realtime.sql).
  if (code === "GC005") return new GameRequestError("not-member", "You're no longer in this game.");
  if (code === "GC006") return new GameRequestError("not-host", "Only the host can start the game.");
  if (code === "GC007") return new GameRequestError("not-enough-players", "You need at least 2 players in the lobby to start.");
  // Raised by the state machine (see supabase/migrations/20261010040000_game_state_machine.sql).
  if (code === "GC008" || code === "GC009") return new GameRequestError("wrong-phase", "The game has already moved on.");
  if (code === "28000" || code === "42501") return new GameRequestError("auth", "You need to be signed in to do that.");
  if (code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01") {
    return new GameRequestError("setup", "The game database isn't set up yet. Apply the Supabase migrations and try again.");
  }
  return new GameRequestError("unknown", fallback);
}

/** Runs a request, turning anything it throws (network failure, timeout) into a GameRequestError. */
export async function guard<T>(request: () => PromiseLike<T>, fallback: string): Promise<T> {
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

/** Calls a lobby action on the database; it checks the caller's seat itself. */
async function lobbyAction(fn: "touch_seat" | "leave_game" | "start_game", gameId: string, fallback: string): Promise<void> {
  const { error } = await guard(
    async () => client().rpc(fn, { p_game_id: gameId }).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    fallback,
  );
  if (error) throw toRequestError(error, fallback);
}

/** Marks this player as recently seen, using the database clock. */
export const touchSeat = (gameId: string) => lobbyAction("touch_seat", gameId, "Couldn't reach the game server.");

/** Frees this player's seat. If they were host, the next player becomes host. */
export const leaveGame = (gameId: string) => lobbyAction("leave_game", gameId, "Couldn't leave the game. Try again.");

/** Moves the game out of the lobby. The database refuses anyone but the host. */
export const startGame = (gameId: string) => lobbyAction("start_game", gameId, "Couldn't start the game. Try again.");

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

export function clearGameSession(roomCode: string): void {
  try {
    sessionStorage.removeItem(sessionKey(roomCode));
  } catch {
    // Nothing stored.
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
