"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findPlayer } from "@/features/game/engine/stateMachine";
import type { Game, GameState, Player } from "@/features/game/engine/types";
import type { ClientCommand, PlayerSession } from "@/features/game/protocol";
import { GameClientError, getGameClient, loadSession, type LiveStatus } from "@/services/gameClient";

export interface UseGame {
  /** null when this tab has no session for the room (not joined yet). undefined while loading. */
  session: PlayerSession | null | undefined;
  game: Game | null;
  me: Player | undefined;
  live: LiveStatus;
  /** A fatal error (room gone, session expired). */
  error: GameClientError | null;
  /** Sends a command; resolves with an error message if the server refused it. */
  send: (command: ClientCommand) => Promise<string | null>;
  /** The server's clock, estimated from the last snapshot. */
  serverNow: () => number;
}

/** Live state of one game for this browser tab's player. */
export function useGame(code: string): UseGame {
  const [session, setSession] = useState<PlayerSession | null | undefined>(undefined);
  const [game, setGame] = useState<Game | null>(null);
  const [live, setLive] = useState<LiveStatus>("connecting");
  const [error, setError] = useState<GameClientError | null>(null);
  const offset = useRef(0);
  const version = useRef(0);

  const accept = useCallback((state: GameState) => {
    offset.current = state.serverTime - Date.now();
    if (state.game.version < version.current) return;
    version.current = state.game.version;
    setGame(state.game);
  }, []);

  useEffect(() => {
    setSession(loadSession(code));
  }, [code]);

  useEffect(() => {
    if (!session) return;
    version.current = 0;
    return getGameClient().subscribe(session, { onState: accept, onStatus: setLive, onError: setError });
  }, [session, accept]);

  const send = useCallback(
    async (command: ClientCommand) => {
      if (!session) return "You're not in this game.";
      try {
        accept(await getGameClient().send(session, command));
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Something went wrong.";
      }
    },
    [session, accept],
  );

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  const me = game && session ? findPlayer(game, session.playerId) : undefined;

  return { session, game, me, live, error, send, serverNow };
}

/** Whole seconds left in the current phase, ticking with the server clock. */
export function usePhaseSeconds(game: Game | null, serverNow: () => number): number {
  const endsAt = game?.phaseEndsAt ?? null;
  const compute = useCallback(() => (endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - serverNow()) / 1000))), [endsAt, serverNow]);
  const [seconds, setSeconds] = useState(compute);
  useEffect(() => {
    setSeconds(compute());
    if (endsAt === null) return;
    const id = window.setInterval(() => setSeconds(compute()), 200);
    return () => window.clearInterval(id);
  }, [compute, endsAt]);
  return seconds;
}
