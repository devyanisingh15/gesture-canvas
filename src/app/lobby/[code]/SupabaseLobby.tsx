"use client";

import { Loader2, RotateCcw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GameHeader } from "@/components/game/GameHeader";
import { GameLobby } from "@/components/game/GameLobby";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { StateScreen } from "@/components/states/StateScreen";
import { Button } from "@/components/ui/Button";
import type { AvatarColor, GamePhase, GameRoom } from "@/features/game/types";
import {
  fetchLobby,
  GameRequestError,
  loadGameSession,
  type GameSession,
  type LobbyGame,
  type LobbyPlayer,
} from "@/services/supabaseGames";

/** How often the lobby re-reads the player list until live updates are wired up. */
const REFRESH_MS = 5_000;
const AVATARS: AvatarColor[] = ["violet", "pink", "sun", "mint", "sky", "peach"];
// The schema has no per-game timer or seat limit yet; these match the app's defaults.
const DRAW_SECONDS = 60;
const MAX_PLAYERS = 6;

type LobbyState =
  | { status: "loading" }
  | { status: "ready"; game: LobbyGame; players: LobbyPlayer[] }
  | { status: "error"; error: GameRequestError };

function toRoom(game: LobbyGame, players: LobbyPlayer[], me: string): GameRoom {
  return {
    code: game.roomCode,
    settings: { rounds: game.totalRounds, drawSeconds: DRAW_SECONDS, maxPlayers: MAX_PLAYERS },
    currentRound: game.currentRound,
    phase: (game.status === "COMPLETED" ? "FINAL_RESULTS" : game.status) as GamePhase,
    players: players.map((p, i) => ({
      id: p.id,
      name: p.displayName,
      avatar: AVATARS[i % AVATARS.length]!,
      isHost: p.isHost,
      isYou: p.id === me,
      // Ready-up isn't stored yet; the host counts as ready.
      isReady: p.isHost,
      connection: "connected",
    })),
    targetPromptId: "house",
  };
}

/** The lobby of a game stored in Supabase, for the player whose session this tab holds. */
export function SupabaseLobby({ code }: { code: string }) {
  // undefined until read on the client; null when this tab has no seat in the room.
  const [session, setSession] = useState<GameSession | null>();
  const [state, setState] = useState<LobbyState>({ status: "loading" });

  useEffect(() => setSession(loadGameSession(code)), [code]);

  const load = useCallback(
    async (quiet: boolean) => {
      if (!session) return;
      if (!quiet) setState({ status: "loading" });
      try {
        const { game, players } = await fetchLobby(session.gameId);
        setState({ status: "ready", game, players });
      } catch (err) {
        const error = err instanceof GameRequestError ? err : new GameRequestError("unknown", "Couldn't load the lobby.");
        // A failed background refresh keeps showing the last good lobby.
        setState((prev) => (quiet && prev.status === "ready" ? prev : { status: "error", error }));
      }
    },
    [session],
  );

  useEffect(() => {
    if (!session) return;
    void load(false);
    const timer = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [session, load]);

  const ready = state.status === "ready" ? state : null;

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
            title={state.error.kind === "not-found" ? "This game isn't available" : "Couldn't load the lobby"}
            description={state.error.message}
            actions={
              <>
                {state.error.kind !== "not-found" && (
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
          <GameLobby room={toRoom(ready.game, ready.players, session.playerId)} />
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
