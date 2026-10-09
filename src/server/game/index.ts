import { placeholderEvaluator } from "@/features/evaluation/placeholderEvaluator";
import { GameService } from "./gameService";
import { InMemoryGameRepository } from "./repository";

const globalForGames = globalThis as typeof globalThis & { __gestureCanvasGames?: GameService };

/**
 * The process-wide game service. Kept on globalThis so dev-server reloads
 * don't lose running games. In-memory games live in one server process, so
 * this suits local play and a single long-running server, not serverless
 * hosting; the Supabase repository replaces it there.
 */
export function getGameService(): GameService {
  if (!globalForGames.__gestureCanvasGames) {
    const service = new GameService({ repo: new InMemoryGameRepository(), evaluator: placeholderEvaluator });
    service.startClock();
    globalForGames.__gestureCanvasGames = service;
  }
  return globalForGames.__gestureCanvasGames;
}
