import type { GameState } from "@/features/game/engine/types";
import { errorResponse } from "@/server/game/http";
import { getGameService } from "@/server/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * Live game state as Server-Sent Events: one `state` event per change.
 * Query: ?playerId=…&token=… (EventSource can't send headers).
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  const session = { code, playerId: url.searchParams.get("playerId") ?? "", token: url.searchParams.get("token") ?? "" };
  const service = getGameService();

  let disconnect: () => void;
  let initial: GameState;
  try {
    disconnect = await service.connect(session);
    initial = await service.getState(code, session.playerId);
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastVersion = 0;
      const send = (state: GameState) => {
        if (state.game.version < lastVersion) return;
        lastVersion = state.game.version;
        controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify(state)}\n\n`));
      };
      const unsubscribe = service.subscribe(code, (state) => {
        try {
          send(state);
        } catch {
          cleanup();
        }
      }, session.playerId);
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        disconnect();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
      controller.enqueue(encoder.encode(`retry: 1000\n\n`));
      send(initial);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
