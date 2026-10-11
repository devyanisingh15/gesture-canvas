"use client";

import { Loader2, RotateCcw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { GameHeader } from "@/components/game/GameHeader";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { GamePhaseScreen } from "@/components/screens/GamePhaseScreen";
import { StateScreen } from "@/components/states/StateScreen";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { currentRound } from "@/features/game/engine/selectors";
import { isInProgress } from "@/features/game/state";
import { usePhaseSeconds } from "@/hooks/useGame";
import { useRoundDrawing } from "@/hooks/useRoundDrawing";
import { useSupabaseGame } from "@/hooks/useSupabaseGame";
import { clearGameSession } from "@/services/supabaseGames";

const CHECKPOINT_MS = 5_000;

/** A game stored in Supabase, from the lobby to the final results, rendered from the database's state. */
export function SupabaseGame({ code }: { code: string }) {
  const router = useRouter();
  const { session, game, me, link, error, actionError, busy, serverNow, reload, start, skipAhead, leave, saveDrawing } = useSupabaseGame(code);
  const seconds = usePhaseSeconds(game, serverNow);
  // Work in progress is saved every few seconds, so a refresh or a dropped connection keeps it.
  const drawing = useRoundDrawing(game, me?.id, { save: saveDrawing, serverNow, checkpointMs: CHECKPOINT_MS });
  const round = game ? currentRound(game) : undefined;

  const header = (
    <GameHeader
      round={round?.number}
      totalRounds={round && game ? game.settings.rounds : undefined}
      roomCode={code}
      playerCount={game?.players.length ?? 0}
    />
  );

  let body: React.ReactNode;
  if (session === null) {
    body = (
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
    );
  } else if (error && (error.kind === "not-found" || !game)) {
    const gone = error.kind === "not-found";
    body = (
      <ScreenContainer className="py-12">
        <StateScreen
          tone="danger"
          icon={<WifiOff className="size-8" aria-hidden />}
          title={gone ? "You're not in this game any more" : "Couldn't load the game"}
          description={gone ? "You left this game, or it has ended. Join again with the room code." : error.message}
          actions={
            <>
              {gone ? (
                <Button
                  onClick={() => {
                    clearGameSession(code);
                    router.push(`/join?code=${encodeURIComponent(code)}`);
                  }}
                >
                  Join again
                </Button>
              ) : (
                <Button onClick={reload} iconLeft={<RotateCcw className="size-4" aria-hidden />}>
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
    );
  } else if (game && me) {
    const reconnecting = link === "reconnecting";
    body = (
      <div data-phase={game.phase} data-round={round?.number ?? 0}>
        <GamePhaseScreen
          game={game}
          me={me}
          seconds={seconds}
          serverNow={serverNow}
          lobby={{
            onStart: () => void start(),
            onLeave: async () => {
              if (await leave()) {
                clearGameSession(code);
                router.push("/");
              }
            },
            busy,
            error: actionError ?? (reconnecting ? "Connection lost. Reconnecting…" : null),
          }}
          onEndRound={() => void skipAhead()}
          onNextRound={() => void skipAhead()}
          onDrawingChange={drawing.onDrawingChange}
          shownDrawing={drawing.shown}
          resumeDrawing={drawing.resumeFrom}
        />
        {reconnecting && isInProgress(game.phase) && (
          <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center">
            <Badge tone="sun">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Reconnecting…
            </Badge>
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <ScreenContainer className="flex justify-center py-24">
        <p role="status" className="inline-flex items-center gap-2 font-display text-lg font-semibold text-plum-500">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Opening room {code}…
        </p>
      </ScreenContainer>
    );
  }

  return <AppShell header={header}>{body}</AppShell>;
}
