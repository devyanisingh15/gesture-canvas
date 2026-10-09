import { errorResponse, json } from "@/server/game/http";
import { getGameService } from "@/server/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The current state of a game. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    return json(await getGameService().getState(code));
  } catch (error) {
    return errorResponse(error);
  }
}
