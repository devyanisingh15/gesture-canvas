import { Home, RotateCcw } from "lucide-react";
import { Leaderboard } from "@/components/game/Leaderboard";
import { Confetti, WinnerCard } from "@/components/game/WinnerCard";
import { ScreenContainer } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MOCK_FINAL_LEADERBOARD } from "@/mocks/game";

export default function FinalResultsPage() {
  const [winner] = MOCK_FINAL_LEADERBOARD;
  return (
    <>
      <Confetti />
      <ScreenContainer className="relative">
        <div className="text-center">
          <Badge tone="sun" uppercase>
            Final results
          </Badge>
          <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700 sm:text-[40px]">And the winner is…</h1>
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl items-start gap-8 md:grid-cols-2">
          {winner && <WinnerCard entry={winner} />}
          <div className="flex flex-col gap-5">
            <Leaderboard entries={MOCK_FINAL_LEADERBOARD} title="Final leaderboard" showRoundScore={false} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button href="/game/lobby" size="lg" fullWidth iconLeft={<RotateCcw className="size-4" aria-hidden />}>
                Play again
              </Button>
              <Button href="/" variant="secondary" size="lg" fullWidth iconLeft={<Home className="size-4" aria-hidden />}>
                Home
              </Button>
            </div>
          </div>
        </div>
      </ScreenContainer>
    </>
  );
}
