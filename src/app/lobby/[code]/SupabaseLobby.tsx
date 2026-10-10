"use client";

import { Loader2, RotateCcw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameHeader } from "@/components/game/GameHeader";
import { GameLobby } from "@/components/game/GameLobby";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { StateScreen } from "@/components/states/StateScreen";
import { Button } from "@/components/ui/Button";
import type { AvatarColor, GamePhase, GameRoom } from "@/features/game/types";
import { openLobbyLink, type LobbyLink, type LobbyLinkStatus } from "@/services/lobbyRealtime";
import {
  clearGameSession,
  fetchLobby,
  GameRequestError,
  leaveGame,
  loadGameSession,
  startGame,
  type GameSession,
  type LobbyGame,
  type LobbyPlayer,
} from "@/services/supabaseGames";

/** Safety net in case a realtime signal is missed; realtime does the real work. */
const FALLBACK_REFRESH_MS = 30_000;
const AVATARS: AvatarColor[] = ["violet", "pink", "sun", "mint", "sky", "peach"];
// The schema has no per-game timer or seat limit yet; these match the app's defaults.
const DRAW_SECONDS = 60;
const MAX_PLAYERS = 6;

type LobbyState =
  | { status: "loading" }
  | { status: "ready"; game: LobbyGame; players: LobbyPlayer[] }
  | { status: "error"; error: GameRequestError };

/** A stable colour per player, so colours don't shuffle when someone leaves. */
function avatarFor(id: string): AvatarColor {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

function toRoom(game: LobbyGame, players: LobbyPlayer[], me: string, online: ReadonlySet<string> | null, linkUp: boolean): GameRoom {
  return {
    code: game.roomCode,
    settings: { rounds: game.totalRounds, drawSeconds: DRAW_SECONDS, maxPlayers: MAX_PLAYERS },
    currentRound: game.currentRound,
    phase: (game.status === "COMPLETED" ? "FINAL_RESULTS" : game.status) as GamePhase,
    players: players.map((p) => {
      // Until the first presence sync, assume everyone is here rather than flashing "Offline".
      const connected = p.id === me ? linkUp : online === null || online.has(p.id);
      return {
        id: p.id,
        name: p.displayName,
        avatar: avatarFor(p.id),
        isHost: p.isHost,
        isYou: p.id === me,
        // There's no ready-up step yet: a player with the lobby open counts as ready.
        isReady: connected,
        connection: connected ? "connected" : "disconnected",
      };
    }),
    targetPromptId: "house",
  };
}

/** The live lobby of a game stored in Supabase, for the player whose session this tab holds. */
export function SupabaseLobby({ code }: { code: string }) {
  const router = useRouter();
  // undefined until read on the client; null when this tab has no seat in the room.
  const [session, setSession] = useState<GameSession | null>();
  const [state, setState] = useState<LobbyState>({ status: "loading" });
  const [online, setOnline] = useState<ReadonlySet<string> | null>(null);
  const [link, setLink] = useState<LobbyLinkStatus>("connecting");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkRef = useRef<LobbyLink | null>(null);

  useEffect(() => setSession(loadGameSession(code)), [code]);

  // Re-reads the lobby. Calls that arrive while a read is running are folded into one more read.
  const reading = useRef(false);
  const again = useRef(false);
  const load = useCallback(
    async (quiet: boolean) => {
      if (!session) return;
      if (reading.current) {
        again.current = true;
        return;
      }
      reading.current = true;
      if (!quiet) setState({ status: "loading" });
      try {
        do {
          again.current = false;
          try {
            const { game, players } = await fetchLobby(session.gameId);
            setState({ status: "ready", game, players });
          } catch (err) {
            const error = err instanceof GameRequestError ? err : new GameRequestError("unknown", "Couldn't load the lobby.");
            // A failed background read keeps the last good lobby, unless we're no longer in the game.
            setState((prev) => (quiet && prev.status === "ready" && error.kind !== "not-found" ? prev : { status: "error", error }));
          }
        } while (again.current);
      } finally {
        reading.current = false;
      }
    },
    [session],
  );

  // Realtime: presence, change signals and the heartbeat. One link per mounted lobby.
  useEffect(() => {
    if (!session) return;
    void load(false);
    const lobbyLink = openLobbyLink(session, {
      onChange: () => void load(true),
      onPresence: setOnline,
      onStatus: setLink,
      onSeatLost: () => void load(true),
    });
    linkRef.current = lobbyLink;
    const refresh = window.setInterval(() => void load(true), FALLBACK_REFRESH_MS);
    const onFocus = () => document.visibilityState === "visible" && void load(true);
    const onOnline = () => void load(true);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onOnline);
      if (linkRef.current === lobbyLink) linkRef.current = null;
      void lobbyLink.close();
    };
  }, [session, load]);

  const start = async () => {
    if (!session || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await startGame(session.gameId);
      await linkRef.current?.notify();
      await load(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't start the game.");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!session || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await leaveGame(session.gameId);
      // Closing the link drops our presence, which tells the others to re-read the lobby.
      await linkRef.current?.close();
      clearGameSession(code);
      router.push("/");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't leave the game.");
      setBusy(false);
    }
  };

  const ready = state.status === "ready" ? state : null;
  const linkUp = link === "live";

  return (
    <AppShell header={<GameHeader roomCode={code} playerCount={ready?.players.length ?? 0} />}>
      {session === null ? (
        <ScreenContainer className="py-12">
          <StateScreen
            icon={<WifiOff className="size-8" aria-hidden />}
            title="You're not in this game"
            description={`This tab doesn't have a seat in room ${code}. Join with the room code to take one.`}
            actions={
              <>
                <Button href={`/join?code=${encodeURIComponent(code)}`}>Join room</Button>
                <Button href="/" variant="secondary">
                  Home
                </Button>
              </>
            }
          />
        </ScreenContainer>
      ) : state.status === "error" ? (
        <ScreenContainer className="py-12">
          <StateScreen
            tone="danger"
            icon={<WifiOff className="size-8" aria-hidden />}
            title={state.error.kind === "not-found" ? "You're not in this game any more" : "Couldn't load the lobby"}
            description={
              state.error.kind === "not-found" ? "You left this game, or it has ended. Join again with the room code." : state.error.message
            }
            actions={
              <>
                {state.error.kind === "not-found" ? (
                  <Button
                    onClick={() => {
                      clearGameSession(code);
                      router.push(`/join?code=${encodeURIComponent(code)}`);
                    }}
                  >
                    Join again
                  </Button>
                ) : (
                  <Button onClick={() => void load(false)} iconLeft={<RotateCcw className="size-4" aria-hidden />}>
                    Try again
                  </Button>
                )}
                <Button href="/" variant="secondary">
                  Home
                </Button>
              </>
            }
          />
        </ScreenContainer>
      ) : ready && session ? (
        <ScreenContainer>
          <GameLobby
            room={toRoom(ready.game, ready.players, session.playerId, online, linkUp)}
            onStart={() => void start()}
            onLeave={() => void leave()}
            busy={busy}
            startingIn={ready.game.status === "LOBBY" ? null : 0}
            error={actionError ?? (link === "reconnecting" ? "Connection lost. Reconnecting…" : null)}
          />
        </ScreenContainer>
      ) : (
        <ScreenContainer className="flex justify-center py-24">
          <p role="status" className="inline-flex items-center gap-2 font-display text-lg font-semibold text-plum-500">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Opening room {code}…
          </p>
        </ScreenContainer>
      )}
    </AppShell>
  );
}
