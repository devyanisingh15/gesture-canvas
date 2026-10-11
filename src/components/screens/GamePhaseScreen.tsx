"use client";

import { ArrowRight, Home, RotateCcw } from "lucide-react";
import type { ComponentProps } from "react";
import { GameLobby } from "@/components/game/GameLobby";
import { TargetReveal } from "@/components/game/TargetReveal";
import { ScreenContainer } from "@/components/layout/AppShell";
import { DrawScreen } from "@/components/screens/DrawScreen";
import { EvaluatingScreen } from "@/components/screens/EvaluatingScreen";
import { FinalResultsScreen } from "@/components/screens/FinalResultsScreen";
import { RoundResultsScreen } from "@/components/screens/RoundResultsScreen";
import { TimesUpScreen } from "@/components/screens/TimesUpScreen";
import { WheelScreen } from "@/components/screens/WheelScreen";
import { Button } from "@/components/ui/Button";
import type { Drawing } from "@/features/drawing/types";
import { currentRound, isLastRound, leaderboard, playerViews, roundResults, toGameRoom } from "@/features/game/engine/selectors";
import type { Game, Player } from "@/features/game/engine/types";
import { getPrompt } from "@/features/game/prompts";

type LobbyActions = Omit<ComponentProps<typeof GameLobby>, "room" | "startHref" | "startingIn">;

interface GamePhaseScreenProps {
  /** The authoritative game, from whichever backend runs it. */
  game: Game;
  me: Player;
  /** Whole seconds left in the current phase, on the server clock. */
  seconds: number;
  /** The server's clock (ms), for syncing animations to phase start times. */
  serverNow: () => number;
  lobby: LobbyActions;
  /** Host: end drawing early. */
  onEndRound?: () => void;
  /** Host: go on from the round results now. */
  onNextRound?: () => void;
  /** This player's drawing: reported while drawing, shown afterwards. */
  onDrawingChange: (drawing: Drawing) => void;
  shownDrawing: Drawing;
  /** This player's saved drawing for the round, to continue after a refresh. */
  resumeDrawing?: Drawing | null;
}

/**
 * The one place that decides which screen each game phase shows. Both the
 * in-memory room and the Supabase room render through it, from server state.
 */
export function GamePhaseScreen({ game, me, seconds, serverNow, lobby, onEndRound, onNextRound, onDrawingChange, shownDrawing, resumeDrawing }: GamePhaseScreenProps) {
  const round = currentRound(game);
  const roundNumber = round?.number ?? 0;
  const players = playerViews(game, me.id);
  const isHost = me.id === game.hostId;
  const prompt = round ? getPrompt(round.promptId) : null;
  const connectedCount = game.players.filter((p) => p.connection === "connected").length;

  switch (game.phase) {
    case "LOBBY":
    case "STARTING":
      return (
        <ScreenContainer>
          <GameLobby room={toGameRoom(game, me.id)} startingIn={game.phase === "STARTING" ? seconds : null} {...lobby} />
        </ScreenContainer>
      );
    case "WHEEL_SPINNING":
      return (
        <ScreenContainer>
          <WheelScreen
            key={roundNumber}
            round={roundNumber}
            totalRounds={game.settings.rounds}
            targetId={round!.promptId}
            players={players}
            autoSpin
            spinStartedAt={game.phaseStartedAt}
            serverNow={serverNow}
          />
        </ScreenContainer>
      );
    case "TARGET_REVEALED":
      return (
        <ScreenContainer className="py-12">
          <TargetReveal prompt={prompt!} startsIn={seconds} />
        </ScreenContainer>
      );
    case "DRAWING":
      return (
        <ScreenContainer className="py-6 sm:py-8">
          <DrawScreen
            key={roundNumber}
            prompt={prompt!}
            total={game.settings.drawSeconds}
            remaining={seconds}
            players={players}
            // Your own saved work in progress isn't "done" yet.
            submittedIds={Object.keys(round!.drawings).filter((id) => id !== me.id)}
            initialDrawing={resumeDrawing}
            onDrawingChange={onDrawingChange}
            onEndRound={isHost ? onEndRound : undefined}
          />
        </ScreenContainer>
      );
    case "TIME_UP":
      return (
        <ScreenContainer className="flex flex-col items-center py-14 text-center">
          <TimesUpScreen strokes={shownDrawing.strokes} submitted={Object.keys(round!.drawings).length} total={connectedCount} />
        </ScreenContainer>
      );
    case "EVALUATING":
      return (
        <ScreenContainer>
          <EvaluatingScreen key={roundNumber} strokes={shownDrawing.strokes} />
        </ScreenContainer>
      );
    case "ROUND_RESULTS": {
      const results = roundResults(game, round!).map((result) => ({ player: players.find((p) => p.id === result.playerId)!, result }));
      const last = isLastRound(game);
      return (
        <ScreenContainer>
          <RoundResultsScreen
            round={roundNumber}
            prompt={prompt!}
            yours={results.find((r) => r.player.isYou)}
            others={results.filter((r) => !r.player.isYou)}
            leaderboard={leaderboard(game, me.id)}
            action={
              isHost && onNextRound ? (
                <Button size="lg" onClick={onNextRound} iconRight={<ArrowRight className="size-4" aria-hidden />}>
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
    }
    case "FINAL_RESULTS":
    case "COMPLETED":
      return (
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
  }
}
