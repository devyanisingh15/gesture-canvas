import { errorResponse, json, parseJoinInput, parseSettings, readBody } from "@/server/game/http";
import { getGameService } from "@/server/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a game. Body: { host: { name, avatar }, settings? }. */
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    return json(await getGameService().createGame(parseJoinInput(body.host), parseSettings(body.settings)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
