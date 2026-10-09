import { Trophy } from "lucide-react";
import { Sparkle, Star } from "@/components/art/Decorations";
import { Avatar } from "@/components/ui/Avatar";
import type { LeaderboardEntry } from "@/features/game/types";

/** Podium card for the final winner. */
export function WinnerCard({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="relative mx-auto flex max-w-sm flex-col items-center rounded-[32px] border-4 border-white bg-gradient-to-b from-sun-100 to-sun-200 px-8 pb-8 pt-12 text-center shadow-clay-sun animate-pop">
      <span className="absolute -top-8 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-400 to-violet-600 shadow-clay-violet">
        <Trophy className="size-8 text-sun-200" aria-hidden />
      </span>
      <Star className="absolute -left-4 top-10 size-8 animate-float" />
      <Sparkle className="absolute -right-3 top-16 size-6 text-violet-300" />
      <Avatar name={entry.player.name} color={entry.player.avatar} size="xl" />
      <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.18em] text-sun-600">Winner</p>
      <h2 className="mt-1 text-4xl font-bold text-plum-700">{entry.player.isYou ? "You win!" : entry.player.name}</h2>
      <p className="mt-2 font-display text-lg font-semibold text-plum-500">
        <span className="text-3xl font-bold text-mint-600">{entry.totalScore}</span> points
      </p>
    </div>
  );
}

/** Lightweight CSS confetti for celebration screens. */
export function Confetti() {
  const colors = ["#8b5cf6", "#f48fb9", "#f5c542", "#3dd68c", "#a585f8"];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2 rounded-sm animate-confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            backgroundColor: colors[i % colors.length],
            animationDelay: `${(i % 7) * 0.45}s`,
            animationDuration: `${3 + (i % 5) * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}
