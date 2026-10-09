import { errorResponse, json, parseCommand, parseSession, readBody } from "@/server/game/http";
import { getGameService } from "@/server/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send a player command. Body: { playerId, token, command }. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await readBody(request);
    return json(await getGameService().dispatch(parseSession(code, body), parseCommand(body.command)));
  } catch (error) {
    return errorResponse(error);
  }
}
