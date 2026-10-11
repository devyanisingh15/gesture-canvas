"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing } from "@/features/drawing/types";
import type { Game, Player } from "@/features/game/engine/types";
import { ServerClock } from "@/features/game/clock";
import { openLobbyLink, type LobbyLink, type LobbyLinkStatus } from "@/services/lobbyRealtime";
import { advanceGame, fetchGameState, hostAdvance, requestEvaluation, submitDrawing, toEngineGame, type GameSnapshot } from "@/services/supabaseGameState";
import { GameRequestError, leaveGame, loadGameSession, startGame, type GameSession } from "@/services/supabaseGames";

/** Safety net in case a realtime signal is missed; realtime and the phase timer do the real work. */
const FALLBACK_REFRESH_MS = 30_000;
/** Spread clients' "time's up" calls a little; the database lets exactly one through anyway. */
const ADVANCE_JITTER_MS = 250;
/** Spread players' "please score this round" requests; only the first does any work. */
const EVALUATE_JITTER_MS = 600;
/** Longest wait between retries when the database can't be reached. */
const ADVANCE_RETRY_MAX_MS = 5_000;

export interface UseSupabaseGame {
  /** undefined while loading; null when this tab has no seat in the room. */
  session: GameSession | null | undefined;
  /** The authoritative game, in the shape the screens render. */
  game: Game | null;
  me: Player | undefined;
  link: LobbyLinkStatus;
  /** Loading the game failed (null while fine). "not-found" means this player isn't in it any more. */
  error: GameRequestError | null;
  /** The last action's error, for the screen to show. */
  actionError: string | null;
  busy: boolean;
  serverNow: () => number;
  reload: () => void;
  start: () => Promise<void>;
  /** Host: end drawing early, or go on from the results. */
  skipAhead: () => Promise<void>;
  /** Resolves true once the seat is freed. */
  leave: () => Promise<boolean>;
  /** Saves this player's drawing for a round; "closed" once the database's deadline has passed. */
  saveDrawing: (roundNumber: number, drawing: Drawing, final: boolean) => Promise<"saved" | "closed">;
}

/**
 * One game stored in Supabase, for the player whose seat this tab holds.
 * Renders only what the database says; never decides a phase itself.
 */
export function useSupabaseGame(code: string): UseSupabaseGame {
  const [session, setSession] = useState<GameSession | null>();
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<GameRequestError | null>(null);
  const [online, setOnline] = useState<ReadonlySet<string> | null>(null);
  const [link, setLink] = useState<LobbyLinkStatus>("connecting");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef<LobbyLink | null>(null);
  // The database's clock, estimated from every read: countdowns never trust the local clock.
  const [clock] = useState(() => new ServerClock());
  const serverNow = clock.now;
  const version = useRef(-1);

  useEffect(() => setSession(loadGameSession(code)), [code]);

  // Re-reads the game. Calls that arrive while a read is running fold into one more read.
  const reading = useRef(false);
  const again = useRef(false);
  const load = useCallback(async () => {
    if (!session) return;
    if (reading.current) {
      again.current = true;
      return;
    }
    reading.current = true;
    try {
      do {
        again.current = false;
        try {
          const sentAt = Date.now();
          const next = await fetchGameState(session.gameId);
          if (!next) {
            setError(new GameRequestError("not-found", "You left this game, or it has ended."));
            continue;
          }
          clock.add({ sentAt, receivedAt: Date.now(), serverTime: next.serverTime });
          // Never step back to an older state than one already shown.
          if (next.game.version < version.current) continue;
          version.current = next.game.version;
          setSnap(next);
          setError(null);
        } catch (err) {
          const e = err instanceof GameRequestError ? err : new GameRequestError("unknown", "Couldn't load the game.");
          // A failed background read keeps showing the last good state.
          setError((prev) => (version.current >= 0 ? prev : e));
        }
      } while (again.current);
    } finally {
      reading.current = false;
    }
  }, [session, clock]);

  // Realtime: presence, change signals and the heartbeat. One link per mounted game.
  useEffect(() => {
    if (!session) return;
    version.current = -1;
    void load();
    const lobbyLink = openLobbyLink(session, {
      onChange: () => void load(),
      onPresence: setOnline,
      onStatus: setLink,
      onSeatLost: () => void load(),
    });
    linkRef.current = lobbyLink;
    const refresh = window.setInterval(() => void load(), FALLBACK_REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (linkRef.current === lobbyLink) linkRef.current = null;
      void lobbyLink.close();
    };
  }, [session, load]);

  // When the current phase's time is up, ask the database to move on. Every
  // client does this; the database applies it once and the rest are no-ops.
  const phaseEndsAt = snap?.game.phaseEndsAt ?? null;
  const phaseVersion = snap?.game.version ?? -1;
  useEffect(() => {
    if (!session || phaseEndsAt === null) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const fire = async () => {
      if (cancelled) return;
      try {
        const result = await advanceGame(session.gameId, phaseVersion);
        if (cancelled) return;
        if (result.advanced) {
          void linkRef.current?.notify();
          void load();
        } else if (result.version !== phaseVersion) {
          void load(); // someone else moved it on
        } else {
          timer = setTimeout(fire, 500); // not due yet by the database clock
        }
      } catch {
        // The database didn't answer or refused (network, timeout, a failed write).
        // Nothing moved, so keep asking, backing off, until it does or a re-read shows someone else did.
        if (cancelled) return;
        timer = setTimeout(fire, Math.min(ADVANCE_RETRY_MAX_MS, 1_000 * 2 ** Math.min(tries++, 3)));
        if (tries % 3 === 0) void load();
      }
    };
    timer = setTimeout(fire, Math.max(0, phaseEndsAt - serverNow()) + 100 + Math.random() * ADVANCE_JITTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, phaseEndsAt, phaseVersion, serverNow, load]);

  useEffect(() => setActionError(null), [snap?.game.status]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      if (!session || busy) return false;
      setBusy(true);
      setActionError(null);
      try {
        await action();
        return true;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Something went wrong.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [session, busy],
  );

  const start = useCallback(async () => {
    await act(async () => {
      await startGame(session!.gameId);
      await linkRef.current?.notify();
      await load();
    });
  }, [act, session, load]);

  const skipAhead = useCallback(async () => {
    await act(async () => {
      const result = await hostAdvance(session!.gameId, version.current);
      if (result.advanced) await linkRef.current?.notify();
      await load();
    });
  }, [act, session, load]);

  const leave = useCallback(
    () =>
      act(async () => {
        await leaveGame(session!.gameId);
        // Closing the link drops our presence, which tells the others to re-read.
        await linkRef.current?.close();
      }),
    [act, session],
  );

  const roundIds = useMemo(() => new Map(snap?.rounds.map((r) => [r.number, r.id])), [snap?.rounds]);
  const roundIdsRef = useRef(roundIds);
  roundIdsRef.current = roundIds;
  const drawSecondsRef = useRef(0);
  drawSecondsRef.current = snap?.game.drawSeconds ?? 0;
  const saveDrawing = useCallback(
    async (roundNumber: number, drawing: Drawing, final: boolean) => {
      const roundId = roundIdsRef.current.get(roundNumber);
      if (!session || !roundId) throw new GameRequestError("unknown", "This round isn't loaded yet.");
      try {
        await submitDrawing(roundId, drawing, drawSecondsRef.current);
      } catch (err) {
        if (!(err instanceof GameRequestError)) throw err;
        // Handed in already (from another tab): the game has this round's drawing.
        if (err.kind === "already-submitted") return "saved";
        if (err.kind === "closed" || err.kind === "invalid-drawing") {
          if (final) setActionError(err.kind === "closed" ? "Time was up before your drawing reached the game." : err.message);
          return "closed"; // retrying won't change the answer
        }
        throw err;
      }
      if (final) void load();
      return "saved";
    },
    [session, load],
  );

  // EVALUATING: ask the app server to score the round. Every player asks (one
  // of them may be offline); the database stores the first set of scores only.
  const evaluatingRound = snap?.game.status === "EVALUATING" ? roundIds.get(snap.game.currentRound) : undefined;
  useEffect(() => {
    if (!evaluatingRound) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ask = () =>
      requestEvaluation(evaluatingRound).then(
        (scored) => {
          if (cancelled || !scored) return; // no scorer set up: the round ends with zeros after the wait
          void linkRef.current?.notify();
          void load();
        },
        () => {
          if (!cancelled && ++tries < 3) timer = setTimeout(ask, 1_500);
        },
      );
    timer = setTimeout(ask, Math.random() * EVALUATE_JITTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [evaluatingRound, load]);

  const game = useMemo(
    () => (snap && session ? toEngineGame(snap, session.playerId, online, link === "live") : null),
    [snap, session, online, link],
  );
  const me = game && session ? game.players.find((p) => p.id === session.playerId) : undefined;

  return { session, game, me, link, error, actionError, busy, serverNow, reload: () => void load(), start, skipAhead, leave, saveDrawing };
}
