import { errorResponse, json, parseJoinInput, readBody } from "@/server/game/http";
import { getGameService } from "@/server/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Join a game in its lobby. Body: { player: { name, avatar } }. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await readBody(request);
    return json(await getGameService().joinGame(code, parseJoinInput(body.player)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
