import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { LeaderboardEntry } from "@/features/game/types";
import { cn } from "@/lib/cn";

const RANK_STYLES: Record<number, string> = {
  1: "bg-gradient-to-b from-sun-200 to-sun-300 text-plum-800 shadow-clay-sun",
  2: "bg-violet-100 text-violet-700",
  3: "bg-pink-100 text-pink-600",
};

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  title?: string;
  showRoundScore?: boolean;
  className?: string;
}

export function Leaderboard({ entries, title = "Leaderboard", showRoundScore = true, className }: LeaderboardProps) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <h2 className="text-lg font-semibold text-plum-700">{title}</h2>
      <ol className="mt-4 flex flex-col gap-2.5">
        {entries.map((e) => (
          <li
            key={e.player.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5",
              e.player.isYou ? "border-violet-300 bg-violet-50" : "border-white bg-cream-50",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold",
                RANK_STYLES[e.rank] ?? "bg-white text-plum-500",
              )}
            >
              {e.rank}
            </span>
            <Avatar name={e.player.name} color={e.player.avatar} size="sm" />
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-plum-700">{e.player.name}</span>
            {showRoundScore && (
              <span className="hidden text-xs font-bold text-mint-600 sm:inline">+{e.lastRoundScore}</span>
            )}
            <RankChange change={e.rankChange} />
            <span className="w-12 text-right font-display text-lg font-bold tabular-nums text-plum-700">{e.totalScore}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RankChange({ change }: { change: number }) {
  if (change > 0) return <ArrowUp className="size-4 text-mint-600" aria-label={`Up ${change}`} />;
  if (change < 0) return <ArrowDown className="size-4 text-danger-500" aria-label={`Down ${-change}`} />;
  return <Minus className="size-4 text-plum-300" aria-label="No change" />;
}
