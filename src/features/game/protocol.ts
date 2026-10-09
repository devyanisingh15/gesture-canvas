/**
 * The contract between the browser and the game server. The HTTP client and
 * the API routes both use these types, so a future Supabase backend only has
 * to honour the same shapes.
 */
import type { GameCommand, GameErrorCode, GameSettings, GameState, JoinInput } from "./engine/types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A command as the client sends it; the server fills in the player from the session. */
export type ClientCommand = DistributiveOmit<GameCommand, "playerId">;

/** Who this browser tab is in a game. The token is the player's secret. */
export interface PlayerSession {
  code: string;
  playerId: string;
  token: string;
}

export interface CreateGameRequest {
  host: JoinInput;
  settings?: Partial<GameSettings>;
}

export interface JoinGameRequest {
  player: JoinInput;
}

export interface SessionResponse {
  session: PlayerSession;
  state: GameState;
}

export interface CommandRequest {
  playerId: string;
  token: string;
  command: ClientCommand;
}

export interface ErrorResponse {
  error: { code: GameErrorCode | "BAD_REQUEST" | "NETWORK"; message: string };
}

/** Room codes avoid look-alike characters (0/O, 1/I). */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
