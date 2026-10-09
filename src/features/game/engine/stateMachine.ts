/**
 * The Gesture Canvas game engine: a pure, deterministic state machine.
 * Every change to a game goes through createGame, addPlayer or applyEvent.
 * Nothing here does I/O, reads the clock or uses Math.random directly, so the
 * same engine can run in the in-memory service today and in a server function
 * backed by Postgres later.
 */
import { PROMPTS } from "../prompts";
import type { PromptId } from "../types";
import {
  GameError,
  type EngineContext,
  type Game,
  type GameEvent,
  type GamePhase,
  type GameSettings,
  type JoinInput,
  type Player,
  type Round,
  type Score,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const NAME_MAX_LENGTH = 16;

export const DEFAULT_SETTINGS: GameSettings = { rounds: 3, drawSeconds: 60, maxPlayers: MAX_PLAYERS };

/** How long timed phases last (ms). DRAWING uses settings.drawSeconds. */
export const PHASE_DURATIONS = {
  STARTING: 3_000,
  WHEEL_SPINNING: 6_000,
  TARGET_REVEALED: 5_000,
  TIME_UP: 3_000,
  /** Shortest time on the evaluation screen, so its animation can play. */
  EVALUATING_MIN: 4_500,
  /** Longest wait for scores before missing ones count as zero. */
  EVALUATING_MAX: 20_000,
  /** Results auto-advance if the host doesn't press "Next Round". */
  ROUND_RESULTS: 30_000,
} as const;

/** Legal phase transitions. Anything else is a bug and throws. */
export const TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  LOBBY: ["STARTING"],
  STARTING: ["WHEEL_SPINNING", "LOBBY", "FINAL_RESULTS"],
  WHEEL_SPINNING: ["TARGET_REVEALED", "FINAL_RESULTS"],
  TARGET_REVEALED: ["DRAWING", "FINAL_RESULTS"],
  DRAWING: ["TIME_UP", "FINAL_RESULTS"],
  TIME_UP: ["EVALUATING", "FINAL_RESULTS"],
  EVALUATING: ["ROUND_RESULTS", "FINAL_RESULTS"],
  ROUND_RESULTS: ["WHEEL_SPINNING", "FINAL_RESULTS"],
  FINAL_RESULTS: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Creation and joining

export interface NewGameIds {
  gameId: string;
  hostId: string;
  code: string;
}

export function createGame(host: JoinInput, settings: Partial<GameSettings>, ids: NewGameIds, ctx: EngineContext): Game {
  const name = validateName(host.name);
  const merged = validateSettings({ ...DEFAULT_SETTINGS, ...settings });
  return {
    id: ids.gameId,
    code: ids.code,
    hostId: ids.hostId,
    settings: merged,
    phase: "LOBBY",
    phaseStartedAt: ctx.now,
    phaseEndsAt: null,
    players: [
      { id: ids.hostId, name, avatar: host.avatar, isHost: true, isReady: true, connection: "connected", joinedAt: ctx.now },
    ],
    rounds: [],
    usedPromptIds: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
    version: 1,
  };
}

export function addPlayer(game: Game, input: JoinInput, playerId: string, ctx: EngineContext): Game {
  if (game.phase !== "LOBBY") throw new GameError("GAME_IN_PROGRESS", "This game has already started.");
  if (game.players.length >= game.settings.maxPlayers) throw new GameError("GAME_FULL", "This game is full.");
  const name = validateName(input.name);
  if (game.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError("NAME_TAKEN", `Someone called ${name} is already in this game.`);
  }
  const player: Player = { id: playerId, name, avatar: input.avatar, isHost: false, isReady: false, connection: "connected", joinedAt: ctx.now };
  return touch({ ...game, players: [...game.players, player] }, ctx);
}

// ---------------------------------------------------------------------------
// Events

export function applyEvent(game: Game, event: GameEvent, ctx: EngineContext): Game {
  switch (event.type) {
    case "SET_READY": {
      requirePhase(game, "LOBBY");
      requirePlayer(game, event.playerId);
      return touch(updatePlayer(game, event.playerId, { isReady: event.ready }), ctx);
    }
    case "START_GAME": {
      requireHost(game, event.playerId);
      requirePhase(game, "LOBBY");
      const active = game.players.filter((p) => p.connection === "connected");
      if (active.length < MIN_PLAYERS) throw new GameError("NOT_ENOUGH_PLAYERS", `You need at least ${MIN_PLAYERS} players.`);
      if (active.some((p) => !p.isReady)) throw new GameError("PLAYERS_NOT_READY", "Everyone needs to be ready.");
      return enterPhase(game, "STARTING", ctx, ctx.now + PHASE_DURATIONS.STARTING);
    }
    case "SUBMIT_DRAWING": {
      requirePlayer(game, event.playerId);
      if (game.phase !== "DRAWING" && game.phase !== "TIME_UP") {
        throw new GameError("WRONG_PHASE", "Drawings can only be submitted while drawing.");
      }
      const round = currentRound(game)!;
      const updated: Round = {
        ...round,
        drawings: { ...round.drawings, [event.playerId]: { playerId: event.playerId, drawing: event.drawing, submittedAt: ctx.now } },
      };
      let next = touch(replaceCurrentRound(game, updated), ctx);
      // Everyone is in: no need to wait out the rest of TIME_UP.
      if (next.phase === "TIME_UP" && allSubmitted(next)) next = enterPhase(next, "EVALUATING", ctx, ctx.now + PHASE_DURATIONS.EVALUATING_MIN);
      return next;
    }
    case "END_ROUND": {
      requireHost(game, event.playerId);
      requirePhase(game, "DRAWING");
      return enterTimeUp(game, ctx);
    }
    case "NEXT_ROUND": {
      requireHost(game, event.playerId);
      requirePhase(game, "ROUND_RESULTS");
      return advanceFromResults(game, ctx);
    }
    case "END_GAME": {
      requireHost(game, event.playerId);
      if (game.phase === "LOBBY" || game.phase === "FINAL_RESULTS") throw new GameError("WRONG_PHASE", "The game isn't running.");
      return enterPhase(game, "FINAL_RESULTS", ctx, null);
    }
    case "LEAVE": {
      requirePlayer(game, event.playerId);
      return removePlayer(game, event.playerId, ctx);
    }
    case "SET_CONNECTION": {
      if (!findPlayer(game, event.playerId)) return game;
      const player = findPlayer(game, event.playerId)!;
      if (player.connection === event.connection) return game;
      return touch(updatePlayer(game, event.playerId, { connection: event.connection }), ctx);
    }
    case "SCORES_READY": {
      const round = currentRound(game);
      if (game.phase !== "EVALUATING" || !round || round.number !== event.roundNumber) return game;
      const scores = { ...round.scores };
      for (const s of event.scores) scores[s.playerId] = { ...s, roundNumber: round.number, totalScore: clampScore(s.totalScore) };
      return tick(touch(replaceCurrentRound(game, { ...round, scores }), ctx), ctx);
    }
    case "TICK":
      return tick(game, ctx);
  }
}

/** Time-driven transitions. Called by the server clock; a no-op until the phase is due. */
function tick(game: Game, ctx: EngineContext): Game {
  const due = game.phaseEndsAt !== null && ctx.now >= game.phaseEndsAt;
  switch (game.phase) {
    case "STARTING":
      return due ? startRound(game, ctx) : game;
    case "WHEEL_SPINNING":
      return due ? enterPhase(game, "TARGET_REVEALED", ctx, ctx.now + PHASE_DURATIONS.TARGET_REVEALED) : game;
    case "TARGET_REVEALED": {
      if (!due) return game;
      const endsAt = ctx.now + game.settings.drawSeconds * 1000;
      const round = { ...currentRound(game)!, drawingStartedAt: ctx.now, drawingEndsAt: endsAt };
      return enterPhase(replaceCurrentRound(game, round), "DRAWING", ctx, endsAt);
    }
    case "DRAWING":
      return due ? enterTimeUp(game, ctx) : game;
    case "TIME_UP":
      return due ? enterPhase(game, "EVALUATING", ctx, ctx.now + PHASE_DURATIONS.EVALUATING_MIN) : game;
    case "EVALUATING": {
      if (!due) return game;
      if (allScored(game)) return enterPhase(game, "ROUND_RESULTS", ctx, ctx.now + PHASE_DURATIONS.ROUND_RESULTS);
      if (ctx.now - game.phaseStartedAt >= PHASE_DURATIONS.EVALUATING_MAX) {
        return enterPhase(fillMissingScores(game), "ROUND_RESULTS", ctx, ctx.now + PHASE_DURATIONS.ROUND_RESULTS);
      }
      return game;
    }
    case "ROUND_RESULTS":
      return due ? advanceFromResults(game, ctx) : game;
    case "LOBBY":
    case "FINAL_RESULTS":
      return game;
  }
}

// ---------------------------------------------------------------------------
// Transitions

function enterPhase(game: Game, phase: GamePhase, ctx: EngineContext, endsAt: number | null): Game {
  if (!canTransition(game.phase, phase)) {
    throw new GameError("WRONG_PHASE", `Can't go from ${game.phase} to ${phase}.`);
  }
  return touch({ ...game, phase, phaseStartedAt: ctx.now, phaseEndsAt: endsAt }, ctx);
}

function enterTimeUp(game: Game, ctx: EngineContext): Game {
  const next = enterPhase(game, "TIME_UP", ctx, ctx.now + PHASE_DURATIONS.TIME_UP);
  return allSubmitted(next) ? enterPhase(next, "EVALUATING", ctx, ctx.now + PHASE_DURATIONS.EVALUATING_MIN) : next;
}

function startRound(game: Game, ctx: EngineContext): Game {
  const promptId = pickPrompt(game.usedPromptIds, ctx.random);
  const round: Round = {
    number: game.rounds.length + 1,
    promptId,
    startedAt: ctx.now,
    drawingStartedAt: null,
    drawingEndsAt: null,
    drawings: {},
    scores: {},
  };
  const usedPromptIds = game.usedPromptIds.length >= PROMPTS.length - 1 ? [promptId] : [...game.usedPromptIds, promptId];
  return enterPhase({ ...game, rounds: [...game.rounds, round], usedPromptIds }, "WHEEL_SPINNING", ctx, ctx.now + PHASE_DURATIONS.WHEEL_SPINNING);
}

function advanceFromResults(game: Game, ctx: EngineContext): Game {
  return game.rounds.length >= game.settings.rounds ? enterPhase(game, "FINAL_RESULTS", ctx, null) : startRound(game, ctx);
}

function removePlayer(game: Game, playerId: string, ctx: EngineContext): Game {
  let players = game.players.filter((p) => p.id !== playerId);
  let hostId = game.hostId;
  if (hostId === playerId && players.length > 0) {
    // Hand the game to whoever joined next.
    const next = [...players].sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
    hostId = next.id;
    players = players.map((p) => (p.id === next.id ? { ...p, isHost: true, isReady: true } : p));
  }
  let next = touch({ ...game, players, hostId }, ctx);
  const inProgress = next.phase !== "LOBBY" && next.phase !== "FINAL_RESULTS";
  if (inProgress && players.length < MIN_PLAYERS) next = enterPhase(next, "FINAL_RESULTS", ctx, null);
  return next;
}

// ---------------------------------------------------------------------------
// Helpers

/** Picks a prompt not used yet this game (the list resets once every prompt has been used). */
export function pickPrompt(used: readonly PromptId[], random: () => number): PromptId {
  const unused = PROMPTS.filter((p) => !used.includes(p.id));
  const pool = unused.length > 0 ? unused : PROMPTS;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index]!.id;
}

export function currentRound(game: Game): Round | undefined {
  return game.rounds[game.rounds.length - 1];
}

export function findPlayer(game: Game, playerId: string): Player | undefined {
  return game.players.find((p) => p.id === playerId);
}

function allSubmitted(game: Game): boolean {
  const round = currentRound(game);
  return Boolean(round) && game.players.every((p) => p.connection !== "connected" || round!.drawings[p.id]);
}

function allScored(game: Game): boolean {
  const round = currentRound(game);
  return Boolean(round) && game.players.every((p) => round!.scores[p.id]);
}

function fillMissingScores(game: Game): Game {
  const round = currentRound(game)!;
  const scores = { ...round.scores };
  for (const p of game.players) scores[p.id] ??= zeroScore(p.id, round.number);
  return replaceCurrentRound(game, { ...round, scores });
}

export function zeroScore(playerId: string, roundNumber: number): Score {
  return { playerId, roundNumber, shapeScore: 0, structureScore: 0, completenessScore: 0, compositionScore: 0, totalScore: 0 };
}

function replaceCurrentRound(game: Game, round: Round): Game {
  return { ...game, rounds: [...game.rounds.slice(0, -1), round] };
}

function updatePlayer(game: Game, playerId: string, patch: Partial<Player>): Game {
  return { ...game, players: game.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

function touch(game: Game, ctx: EngineContext): Game {
  return { ...game, updatedAt: ctx.now, version: game.version + 1 };
}

function requirePhase(game: Game, phase: GamePhase): void {
  if (game.phase !== phase) throw new GameError("WRONG_PHASE", `Only allowed during ${phase}.`);
}

function requirePlayer(game: Game, playerId: string): Player {
  const player = findPlayer(game, playerId);
  if (!player) throw new GameError("UNKNOWN_PLAYER", "You're not in this game.");
  return player;
}

function requireHost(game: Game, playerId: string): void {
  requirePlayer(game, playerId);
  if (game.hostId !== playerId) throw new GameError("NOT_HOST", "Only the host can do that.");
}

function validateName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    throw new GameError("INVALID_INPUT", `Names must be 1–${NAME_MAX_LENGTH} characters.`);
  }
  return name;
}

function validateSettings(s: GameSettings): GameSettings {
  const ok =
    Number.isInteger(s.rounds) && s.rounds >= 1 && s.rounds <= 10 &&
    Number.isInteger(s.drawSeconds) && s.drawSeconds >= 10 && s.drawSeconds <= 180 &&
    Number.isInteger(s.maxPlayers) && s.maxPlayers >= MIN_PLAYERS && s.maxPlayers <= MAX_PLAYERS;
  if (!ok) throw new GameError("INVALID_INPUT", "Invalid game settings.");
  return s;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
