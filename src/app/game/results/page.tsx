import { ArrowRight } from "lucide-react";
import { Leaderboard } from "@/components/game/Leaderboard";
import { DrawingThumb, ScoreCard } from "@/components/game/ScoreCard";
import { ScreenContainer } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getPrompt } from "@/features/game/prompts";
import { PHASE_ROUTES } from "@/features/game/routes";
import { findPlayer, MOCK_LEADERBOARD, MOCK_ROOM, MOCK_ROUND_RESULTS } from "@/mocks/game";

export default function RoundResultsPage() {
  const prompt = getPrompt(MOCK_ROOM.targetPromptId);
  const [yours, ...others] = MOCK_ROUND_RESULTS;
  const isLastRound = MOCK_ROOM.currentRound >= MOCK_ROOM.settings.rounds;

  return (
    <ScreenContainer>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="mint" uppercase>
            Round {MOCK_ROOM.currentRound} results
          </Badge>
          <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700 sm:text-[40px]">
            Nice {prompt.label.toLowerCase()}!
          </h1>
        </div>
        <Button
          href={isLastRound ? PHASE_ROUTES.FINAL_RESULTS : PHASE_ROUTES.NEXT_ROUND}
          size="lg"
          iconRight={<ArrowRight className="size-4" aria-hidden />}
        >
          {isLastRound ? "See final results" : "Next Round"}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {yours && <ScoreCard player={findPlayer(yours.playerId)} prompt={prompt} result={yours} />}
        <div className="flex flex-col gap-6">
          <Leaderboard entries={MOCK_LEADERBOARD} />
          <section aria-labelledby="others-heading">
            <h2 id="others-heading" className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-plum-400">
              Everyone&apos;s drawings
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {others.map((r) => (
                <DrawingThumb key={r.playerId} player={findPlayer(r.playerId)} result={r} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </ScreenContainer>
  );
}
