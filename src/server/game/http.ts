import { toDrawing } from "@/features/drawing/serialization";
import { GameError, type GameErrorCode, type GameSettings, type JoinInput } from "@/features/game/engine/types";
import type { ClientCommand, ErrorResponse, PlayerSession } from "@/features/game/protocol";
import type { AvatarColor } from "@/features/game/types";

/** Request parsing and error mapping shared by the /api/games routes. */

const AVATARS: readonly AvatarColor[] = ["violet", "pink", "sun", "mint", "sky", "peach"];
const MAX_BODY_BYTES = 1_000_000;

class BadRequest extends Error {}

const STATUS: Record<GameErrorCode, number> = {
  GAME_NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  NOT_HOST: 403,
  INVALID_INPUT: 400,
  GAME_FULL: 409,
  GAME_IN_PROGRESS: 409,
  NAME_TAKEN: 409,
  UNKNOWN_PLAYER: 409,
  WRONG_PHASE: 409,
  NOT_ENOUGH_PLAYERS: 409,
  PLAYERS_NOT_READY: 409,
};

export function errorResponse(error: unknown): Response {
  if (error instanceof GameError) return json<ErrorResponse>({ error: { code: error.code, message: error.message } }, STATUS[error.code]);
  if (error instanceof BadRequest) return json<ErrorResponse>({ error: { code: "BAD_REQUEST", message: error.message } }, 400);
  console.error("[games api]", error);
  return json({ error: { code: "BAD_REQUEST", message: "Something went wrong." } }, 500);
}

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequest("Request too large.");
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest("Expected a JSON object.");
}

export function parseJoinInput(value: unknown): JoinInput {
  const v = value as Partial<JoinInput> | null;
  if (!v || typeof v.name !== "string" || !AVATARS.includes(v.avatar as AvatarColor)) throw new BadRequest("Expected a name and avatar.");
  return { name: v.name, avatar: v.avatar as AvatarColor };
}

export function parseSettings(value: unknown): Partial<GameSettings> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null) throw new BadRequest("Invalid settings.");
  const out: Partial<GameSettings> = {};
  for (const key of ["rounds", "drawSeconds", "maxPlayers"] as const) {
    const n = (value as Record<string, unknown>)[key];
    if (n === undefined) continue;
    if (typeof n !== "number") throw new BadRequest(`Invalid ${key}.`);
    out[key] = n;
  }
  return out;
}

export function parseSession(code: string, body: Record<string, unknown>): PlayerSession {
  if (typeof body.playerId !== "string" || typeof body.token !== "string") throw new BadRequest("Missing player session.");
  return { code, playerId: body.playerId, token: body.token };
}

export function parseCommand(value: unknown): ClientCommand {
  const v = value as Record<string, unknown> | null;
  switch (v?.type) {
    case "SET_READY":
      if (typeof v.ready !== "boolean") break;
      return { type: "SET_READY", ready: v.ready };
    case "SUBMIT_DRAWING":
      try {
        return { type: "SUBMIT_DRAWING", drawing: toDrawing(v.drawing) };
      } catch (e) {
        throw new BadRequest((e as Error).message);
      }
    case "START_GAME":
    case "END_ROUND":
    case "NEXT_ROUND":
    case "END_GAME":
    case "LEAVE":
      return { type: v.type };
  }
  throw new BadRequest("Unknown command.");
}
