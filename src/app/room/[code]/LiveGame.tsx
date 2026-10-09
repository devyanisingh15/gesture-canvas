"use client";

import { ArrowRight, Home, Loader2, RotateCcw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameHeader } from "@/components/game/GameHeader";
import { GameLobby } from "@/components/game/GameLobby";
import { TargetReveal } from "@/components/game/TargetReveal";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { DrawScreen } from "@/components/screens/DrawScreen";
import { EvaluatingScreen } from "@/components/screens/EvaluatingScreen";
import { FinalResultsScreen } from "@/components/screens/FinalResultsScreen";
import { RoundResultsScreen } from "@/components/screens/RoundResultsScreen";
import { TimesUpScreen } from "@/components/screens/TimesUpScreen";
import { WheelScreen } from "@/components/screens/WheelScreen";
import { StateScreen } from "@/components/states/StateScreen";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Drawing } from "@/features/drawing/types";
import { currentRound, isLastRound, leaderboard, playerViews, roundResults, toGameRoom } from "@/features/game/engine/selectors";
import type { Game } from "@/features/game/engine/types";
import { getPrompt } from "@/features/game/prompts";
import { useGame, usePhaseSeconds } from "@/hooks/useGame";
import { clearSession } from "@/services/gameClient";

const EMPTY: Drawing = { strokes: [] };

/** A live game: renders whichever screen the server's phase calls for. */
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

  // The drawing lives here so it survives the DRAWING screen unmounting,
  // and is handed in once the server says time is up.
  const round = game ? currentRound(game) : undefined;
  const roundNumber = round?.number ?? 0;
  const myDrawing = useRef<Drawing>(EMPTY);
  const submittedRound = useRef(0);
  const [handedIn, setHandedIn] = useState<Drawing>(EMPTY);
  useEffect(() => {
    myDrawing.current = EMPTY;
    setHandedIn(EMPTY);
  }, [roundNumber]);
  useEffect(() => {
    if (!game || !me || game.phase !== "TIME_UP" || submittedRound.current === roundNumber) return;
    submittedRound.current = roundNumber;
    const drawing = myDrawing.current;
    setHandedIn(drawing);
    if (!round?.drawings[me.id]) void send({ type: "SUBMIT_DRAWING", drawing });
  }, [game, me, round, roundNumber, send]);

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

  const players = playerViews(game, me.id);
  const isHost = me.id === game.hostId;
  const prompt = round ? getPrompt(round.promptId) : null;
  const shownDrawing = round?.drawings[me.id]?.drawing ?? handedIn;
  const connectedCount = game.players.filter((p) => p.connection === "connected").length;

  let screen: React.ReactNode;
  switch (game.phase) {
    case "LOBBY":
    case "STARTING":
      screen = (
        <ScreenContainer>
          <GameLobby
            room={toGameRoom(game, me.id)}
            onStart={() => void run({ type: "START_GAME" })}
            onToggleReady={() => void run({ type: "SET_READY", ready: !me.isReady })}
            startingIn={game.phase === "STARTING" ? seconds : null}
            error={commandError}
          />
        </ScreenContainer>
      );
      break;
    case "WHEEL_SPINNING":
      screen = (
        <ScreenContainer>
          <WheelScreen key={roundNumber} round={roundNumber} totalRounds={game.settings.rounds} targetId={round!.promptId} players={players} autoSpin />
        </ScreenContainer>
      );
      break;
    case "TARGET_REVEALED":
      screen = (
        <ScreenContainer className="py-12">
          <TargetReveal prompt={prompt!} startsIn={seconds} />
        </ScreenContainer>
      );
      break;
    case "DRAWING":
      screen = (
        <ScreenContainer className="py-6 sm:py-8">
          <DrawScreen
            key={roundNumber}
            prompt={prompt!}
            total={game.settings.drawSeconds}
            remaining={seconds}
            players={players}
            submittedIds={Object.keys(round!.drawings)}
            onDrawingChange={(d) => (myDrawing.current = d)}
            onEndRound={isHost ? () => void run({ type: "END_ROUND" }) : undefined}
          />
        </ScreenContainer>
      );
      break;
    case "TIME_UP":
      screen = (
        <ScreenContainer className="flex flex-col items-center py-14 text-center">
          <TimesUpScreen strokes={shownDrawing.strokes} submitted={Object.keys(round!.drawings).length} total={connectedCount} />
        </ScreenContainer>
      );
      break;
    case "EVALUATING":
      screen = (
        <ScreenContainer>
          <EvaluatingScreen key={roundNumber} strokes={shownDrawing.strokes} />
        </ScreenContainer>
      );
      break;
    case "ROUND_RESULTS": {
      const results = roundResults(game, round!).map((result) => ({ player: players.find((p) => p.id === result.playerId)!, result }));
      const last = isLastRound(game);
      screen = (
        <ScreenContainer>
          <RoundResultsScreen
            round={roundNumber}
            prompt={prompt!}
            yours={results.find((r) => r.player.isYou)}
            others={results.filter((r) => !r.player.isYou)}
            leaderboard={leaderboard(game, me.id)}
            action={
              isHost ? (
                <Button size="lg" onClick={() => void run({ type: "NEXT_ROUND" })} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  {last ? "See final results" : "Next Round"}
                </Button>
              ) : (
                <Button size="lg" disabled>
                  {last ? "Final results" : "Next round"} in {seconds}s
                </Button>
              )
            }
          />
        </ScreenContainer>
      );
      break;
    }
    case "FINAL_RESULTS":
      screen = (
        <FinalResultsScreen
          leaderboard={leaderboard(game, me.id)}
          actions={
            <>
              <Button href="/create" size="lg" fullWidth iconLeft={<RotateCcw className="size-4" aria-hidden />}>
                Play again
              </Button>
              <Button href="/" variant="secondary" size="lg" fullWidth iconLeft={<Home className="size-4" aria-hidden />}>
                Home
              </Button>
            </>
          }
        />
      );
      break;
  }

  return (
    <Frame game={game}>
      <div data-phase={game.phase} data-round={roundNumber}>
        {screen}
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
