import { ArrowRight } from "lucide-react";
import { ScreenContainer } from "@/components/layout/AppShell";
import { RoundResultsScreen } from "@/components/screens/RoundResultsScreen";
import { Button } from "@/components/ui/Button";
import { getPrompt } from "@/features/game/prompts";
import { PHASE_ROUTES } from "@/features/game/routes";
import { findPlayer, MOCK_LEADERBOARD, MOCK_ROOM, MOCK_ROUND_RESULTS } from "@/mocks/game";

export default function RoundResultsPage() {
  const [yours, ...others] = MOCK_ROUND_RESULTS.map((result) => ({ player: findPlayer(result.playerId), result }));
  const isLastRound = MOCK_ROOM.currentRound >= MOCK_ROOM.settings.rounds;

  return (
    <ScreenContainer>
      <RoundResultsScreen
        round={MOCK_ROOM.currentRound}
        prompt={getPrompt(MOCK_ROOM.targetPromptId)}
        yours={yours}
        others={others}
        leaderboard={MOCK_LEADERBOARD}
        action={
          <Button
            href={isLastRound ? PHASE_ROUTES.FINAL_RESULTS : PHASE_ROUTES.WHEEL_SPINNING}
            size="lg"
            iconRight={<ArrowRight className="size-4" aria-hidden />}
          >
            {isLastRound ? "See final results" : "Next Round"}
          </Button>
        }
      />
    </ScreenContainer>
  );
}
