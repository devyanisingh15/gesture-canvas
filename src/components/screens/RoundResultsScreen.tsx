import type { ReactNode } from "react";
import { Leaderboard } from "@/components/game/Leaderboard";
import { DrawingThumb, ScoreCard } from "@/components/game/ScoreCard";
import { Badge } from "@/components/ui/Badge";
import type { DrawingPrompt, LeaderboardEntry, PlayerRoundResult, PlayerView } from "@/features/game/types";

export interface PlayerResult {
  player: PlayerView;
  result: PlayerRoundResult;
}

interface RoundResultsScreenProps {
  round: number;
  prompt: DrawingPrompt;
  yours?: PlayerResult;
  others: PlayerResult[];
  leaderboard: LeaderboardEntry[];
  /** The "Next Round" / "See final results" button, or a waiting message. */
  action: ReactNode;
}

export function RoundResultsScreen({ round, prompt, yours, others, leaderboard, action }: RoundResultsScreenProps) {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="mint" uppercase>
            Round {round} results
          </Badge>
          <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700 sm:text-[40px]">
            Nice {prompt.label.toLowerCase()}!
          </h1>
        </div>
        {action}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {yours && <ScoreCard player={yours.player} prompt={prompt} result={yours.result} />}
        <div className="flex flex-col gap-6">
          <Leaderboard entries={leaderboard} />
          {others.length > 0 && (
            <section aria-labelledby="others-heading">
              <h2 id="others-heading" className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-plum-400">
                Everyone&apos;s drawings
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {others.map((r) => (
                  <DrawingThumb key={r.player.id} player={r.player} result={r.result} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
