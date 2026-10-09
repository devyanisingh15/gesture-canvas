import type { ReactNode } from "react";
import { Leaderboard } from "@/components/game/Leaderboard";
import { Confetti, WinnerCard } from "@/components/game/WinnerCard";
import { ScreenContainer } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import type { LeaderboardEntry } from "@/features/game/types";

/** Winner, final leaderboard and the "Play again" / "Home" buttons passed as `actions`. */
export function FinalResultsScreen({ leaderboard, actions }: { leaderboard: LeaderboardEntry[]; actions: ReactNode }) {
  const [winner] = leaderboard;
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
            <Leaderboard entries={leaderboard} title="Final leaderboard" showRoundScore={false} />
            <div className="flex flex-col gap-3 sm:flex-row">{actions}</div>
          </div>
        </div>
      </ScreenContainer>
    </>
  );
}
