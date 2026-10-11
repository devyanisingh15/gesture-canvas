import type { DrawingEvaluator } from "@/features/evaluation/types";
import { evaluateDrawing } from "@/server/evaluation/evaluationService";
import { addPlayer, applyEvent, createGame, currentRound, findPlayer, zeroScore } from "@/features/game/engine/stateMachine";
import {
  GameError,
  type EngineContext,
  type Game,
  type GameEvent,
  type GameSettings,
  type GameState,
  type JoinInput,
  type Score,
} from "@/features/game/engine/types";
import { CODE_ALPHABET, CODE_LENGTH, type ClientCommand, type PlayerSession, type SessionResponse } from "@/features/game/protocol";
import type { GameRecord, GameRepository } from "./repository";
import { viewFor } from "./view";

export interface GameServiceDeps {
  repo: GameRepository;
  evaluator: DrawingEvaluator;
  now?: () => number;
  random?: () => number;
  newId?: () => string;
  /** How long a player's connection may drop (page reload, network blip) before they show as offline. */
  disconnectGraceMs?: number;
  /** Games untouched for this long are deleted. */
  idleTtlMs?: number;
}

type Listener = (state: GameState) => void;
interface Subscriber {
  listener: Listener;
  /** Whose view of the game it gets (see viewFor). */
  viewerId: string | null;
}

/**
 * Runs games on the server: the only place that changes game state. Every
 * change goes through the pure engine; this class adds storage, identity,
 * the clock, scoring and live updates. Swap the repository (and the live
 * update transport) to move to a real backend.
 */
export class GameService {
  private readonly repo: GameRepository;
  private readonly evaluator: DrawingEvaluator;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly newId: () => string;
  private readonly disconnectGraceMs: number;
  private readonly idleTtlMs: number;

  private readonly listeners = new Map<string, Set<Subscriber>>();
  /** Open live connections per player, keyed `${code}:${playerId}`. */
  private readonly connections = new Map<string, number>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor(deps: GameServiceDeps) {
    this.repo = deps.repo;
    this.evaluator = deps.evaluator;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.disconnectGraceMs = deps.disconnectGraceMs ?? 4_000;
    this.idleTtlMs = deps.idleTtlMs ?? 2 * 60 * 60 * 1000;
  }

  // -------------------------------------------------------------------------
  // Creating and joining

  async createGame(host: JoinInput, settings: Partial<GameSettings> = {}): Promise<SessionResponse> {
    const code = await this.freeCode();
    const hostId = this.newId();
    const game = createGame(host, settings, { gameId: this.newId(), hostId, code }, this.ctx());
    const token = this.newId();
    await this.repo.save({ game, tokens: { [hostId]: token } });
    return { session: { code, playerId: hostId, token }, state: this.snapshot(game, hostId) };
  }

  async joinGame(code: string, input: JoinInput): Promise<SessionResponse> {
    const playerId = this.newId();
    const token = this.newId();
    const record = await this.mutate(code, (r) => ({
      game: addPlayer(r.game, input, playerId, this.ctx()),
      tokens: { ...r.tokens, [playerId]: token },
    }));
    return { session: { code: record.game.code, playerId, token }, state: this.snapshot(record.game, playerId) };
  }

  /** The game as `viewerId` may see it (null: someone not in the game). */
  async getState(code: string, viewerId: string | null = null): Promise<GameState> {
    return this.snapshot((await this.load(code)).game, viewerId);
  }

  // -------------------------------------------------------------------------
  // Commands

  async dispatch(session: PlayerSession, command: ClientCommand): Promise<GameState> {
    const record = await this.mutate(session.code, (r) => {
      this.authorize(r, session);
      const event = { ...command, playerId: session.playerId } as GameEvent;
      const game = applyEvent(r.game, event, this.ctx());
      if (command.type === "LEAVE") {
        const { [session.playerId]: _, ...tokens } = r.tokens;
        return { game, tokens };
      }
      return { ...r, game };
    });
    return this.snapshot(record.game, session.playerId);
  }

  // -------------------------------------------------------------------------
  // Live updates

  /** Calls `listener` with every new state of the game, as `viewerId` may see it. Returns an unsubscribe function. */
  subscribe(code: string, listener: Listener, viewerId: string | null = null): () => void {
    const key = code.toUpperCase();
    const set = this.listeners.get(key) ?? new Set();
    const subscriber = { listener, viewerId };
    set.add(subscriber);
    this.listeners.set(key, set);
    return () => {
      set.delete(subscriber);
      if (set.size === 0) this.listeners.delete(key);
    };
  }

  /**
   * A player's live connection opened. Marks them connected and returns a
   * function to call when it closes; they show as offline only if no
   * connection comes back within the grace period.
   */
  async connect(session: PlayerSession): Promise<() => void> {
    const record = await this.load(session.code);
    this.authorize(record, session);
    const key = `${record.game.code}:${session.playerId}`;
    this.connections.set(key, (this.connections.get(key) ?? 0) + 1);
    await this.setConnection(record.game.code, session.playerId, "connected");
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      const left = (this.connections.get(key) ?? 1) - 1;
      if (left > 0) {
        this.connections.set(key, left);
        return;
      }
      this.connections.delete(key);
      setTimeout(() => {
        if (!this.connections.has(key)) void this.setConnection(record.game.code, session.playerId, "disconnected").catch(() => {});
      }, this.disconnectGraceMs);
    };
  }

  // -------------------------------------------------------------------------
  // Clock

  /** Advances every game whose phase is due, and deletes abandoned games. */
  async tick(): Promise<void> {
    const now = this.now();
    for (const code of await this.repo.codes()) {
      const record = await this.repo.get(code);
      if (!record) continue;
      const { game } = record;
      const abandoned = now - game.updatedAt > this.idleTtlMs && !this.listeners.has(code);
      if (abandoned) {
        await this.repo.delete(code);
        continue;
      }
      if (game.phaseEndsAt !== null && now >= game.phaseEndsAt) {
        await this.mutate(code, (r) => ({ ...r, game: applyEvent(r.game, { type: "TICK" }, this.ctx()) })).catch(() => {});
      }
    }
  }

  startClock(intervalMs = 250): void {
    if (this.clock) return;
    this.clock = setInterval(() => void this.tick(), intervalMs);
    // Don't keep a Node process alive just for the clock.
    (this.clock as { unref?: () => void }).unref?.();
  }

  stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
  }

  // -------------------------------------------------------------------------
  // Internals

  private ctx(): EngineContext {
    return { now: this.now(), random: this.random };
  }

  private snapshot(game: Game, viewerId: string | null): GameState {
    return viewFor(game, viewerId, this.now());
  }

  private async load(code: string): Promise<GameRecord> {
    const record = await this.repo.get(code);
    if (!record) throw new GameError("GAME_NOT_FOUND", `We couldn't find room ${code.toUpperCase()}.`);
    return record;
  }

  private authorize(record: GameRecord, session: PlayerSession): void {
    const token = record.tokens[session.playerId];
    if (!token || token !== session.token || !findPlayer(record.game, session.playerId)) {
      throw new GameError("UNAUTHORIZED", "Your session for this game has expired.");
    }
  }

  private async setConnection(code: string, playerId: string, connection: "connected" | "disconnected") {
    await this.mutate(code, (r) => ({ ...r, game: applyEvent(r.game, { type: "SET_CONNECTION", playerId, connection }, this.ctx()) }));
  }

  /**
   * Read-modify-write on one game, one at a time per game, then notify
   * listeners and start scoring if the game just entered EVALUATING.
   */
  private mutate(code: string, change: (record: GameRecord) => GameRecord): Promise<GameRecord> {
    const key = code.toUpperCase();
    const run = async () => {
      const before = await this.load(key);
      const after = change(before);
      if (after.game === before.game && after.tokens === before.tokens) return before;
      await this.repo.save(after);
      if (after.game.version !== before.game.version) this.publish(after.game);
      if (after.game.phase === "EVALUATING" && before.game.phase !== "EVALUATING") this.evaluate(after.game);
      return after;
    };
    const previous = this.locks.get(key) ?? Promise.resolve();
    const result = previous.then(run, run);
    const settled = result.catch(() => {});
    this.locks.set(key, settled);
    void settled.then(() => {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    });
    return result;
  }

  private publish(game: Game): void {
    for (const { listener, viewerId } of this.listeners.get(game.code) ?? []) {
      try {
        listener(this.snapshot(game, viewerId));
      } catch {
        // A broken listener must not stop the others.
      }
    }
  }

  /** Scores every drawing in the current round and reports back to the engine. */
  private evaluate(game: Game): void {
    const round = currentRound(game);
    if (!round) return;
    void Promise.all(
      game.players.map(async (p): Promise<Score> => {
        const submitted = round.drawings[p.id];
        if (!submitted) return zeroScore(p.id, round.number);
        const result = await evaluateDrawing(this.evaluator, round.promptId, submitted.drawing);
        const score: Score = {
          playerId: p.id,
          roundNumber: round.number,
          totalScore: result.score,
          structureScore: result.breakdown.structure,
          completenessScore: result.breakdown.completeness,
          compositionScore: result.breakdown.composition,
        };
        if (result.feedback) score.feedback = result.feedback;
        return score;
      }),
    ).then((scores) =>
      this.mutate(game.code, (r) => ({
        ...r,
        game: applyEvent(r.game, { type: "SCORES_READY", roundNumber: round.number, scores }, this.ctx()),
      })).catch(() => {}),
    );
  }

  private async freeCode(): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "";
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!(await this.repo.get(code))) return code;
    }
    throw new Error("Couldn't find a free room code");
  }
}
