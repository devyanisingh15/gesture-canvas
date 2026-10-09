import type { Game } from "@/features/game/engine/types";

/** A stored game plus the secrets that never leave the server. */
export interface GameRecord {
  game: Game;
  /** playerId → session token. Clients prove who they are with this. */
  tokens: Record<string, string>;
}

/**
 * Where games live. The in-memory version below is for local play; a Supabase
 * version implements the same four methods against Postgres.
 */
export interface GameRepository {
  get(code: string): Promise<GameRecord | undefined>;
  save(record: GameRecord): Promise<void>;
  delete(code: string): Promise<void>;
  /** Codes of every stored game, for the clock and cleanup. */
  codes(): Promise<string[]>;
}

export class InMemoryGameRepository implements GameRepository {
  private readonly records = new Map<string, GameRecord>();

  async get(code: string) {
    return this.records.get(code.toUpperCase());
  }

  async save(record: GameRecord) {
    this.records.set(record.game.code, record);
  }

  async delete(code: string) {
    this.records.delete(code.toUpperCase());
  }

  async codes() {
    return [...this.records.keys()];
  }
}
