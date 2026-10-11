"use client";

import { Loader2, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GameHeader } from "@/components/game/GameHeader";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { GamePhaseScreen } from "@/components/screens/GamePhaseScreen";
import { StateScreen } from "@/components/states/StateScreen";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Drawing } from "@/features/drawing/types";
import { currentRound } from "@/features/game/engine/selectors";
import type { Game } from "@/features/game/engine/types";
import { useGame, usePhaseSeconds } from "@/hooks/useGame";
import { useRoundDrawing } from "@/hooks/useRoundDrawing";
import { clearSession } from "@/services/gameClient";

/** A live game on the in-memory server: renders whichever screen the server's phase calls for. */
export function LiveGame({ code }: { code: string }) {
  const router = useRouter();
  const { session, game, me, live, error, send, serverNow } = useGame(code);
  const seconds = usePhaseSeconds(game, serverNow);
  const [commandError, setCommandError] = useState<string | null>(null);

  // No session for this room in this tab: go and join it.
  useEffect(() => {
    if (session === null) router.replace(`/join?code=${encodeURIComponent(code)}`);
  }, [session, code, router]);

  const run = useCallback(
    async (command: Parameters<typeof send>[0]) => {
      setCommandError(await send(command));
    },
    [send],
  );
  useEffect(() => setCommandError(null), [game?.phase]);

  const save = useCallback(
    async (_round: number, drawing: Drawing) => {
      const err = await send({ type: "SUBMIT_DRAWING", drawing });
      if (err === null) return "saved" as const;
      if (/time's up|only be submitted/i.test(err)) return "closed" as const;
      throw new Error(err);
    },
    [send],
  );
  const drawing = useRoundDrawing(game, me?.id, { save, serverNow });

  if (error || (game && !me)) {
    return (
      <Frame game={game}>
        <ScreenContainer className="py-12">
          <StateScreen
            tone="danger"
            icon={<WifiOff className="size-8" aria-hidden />}
            title={error?.code === "GAME_NOT_FOUND" ? "This game has ended" : "You're not in this game"}
            description={error?.message ?? "You left this game or your session expired."}
            actions={
              <>
                <Button
                  onClick={() => {
                    clearSession(code);
                    router.push(`/join?code=${code}`);
                  }}
                >
                  Join again
                </Button>
                <Button href="/" variant="secondary">
                  Home
                </Button>
              </>
            }
          />
        </ScreenContainer>
      </Frame>
    );
  }

  if (!game || !me) {
    return (
      <Frame game={null}>
        <ScreenContainer className="flex justify-center py-24">
          <p className="inline-flex items-center gap-2 font-display text-lg font-semibold text-plum-500">
            <Loader2 className="size-5 animate-spin" aria-hidden /> Joining room {code}…
          </p>
        </ScreenContainer>
      </Frame>
    );
  }

  return (
    <Frame game={game}>
      <div data-phase={game.phase} data-round={currentRound(game)?.number ?? 0}>
        <GamePhaseScreen
          game={game}
          me={me}
          seconds={seconds}
          serverNow={serverNow}
          lobby={{
            onStart: () => void run({ type: "START_GAME" }),
            onToggleReady: () => void run({ type: "SET_READY", ready: !me.isReady }),
            error: commandError,
          }}
          onEndRound={() => void run({ type: "END_ROUND" })}
          onNextRound={() => void run({ type: "NEXT_ROUND" })}
          onDrawingChange={drawing.onDrawingChange}
          shownDrawing={drawing.shown}
          resumeDrawing={drawing.resumeFrom}
        />
      </div>
      {live === "reconnecting" && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center">
          <Badge tone="sun">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Reconnecting…
          </Badge>
        </div>
      )}
    </Frame>
  );
}

function Frame({ game, children }: { game: Game | null; children: React.ReactNode }) {
  const round = game ? currentRound(game) : undefined;
  return (
    <AppShell
      header={
        game ? (
          <GameHeader
            round={round?.number}
            totalRounds={round ? game.settings.rounds : undefined}
            roomCode={game.code}
            playerCount={game.players.length}
          />
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
