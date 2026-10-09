import { Users } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";

interface GameHeaderProps {
  round?: number;
  totalRounds?: number;
  roomCode: string;
  playerCount: number;
}

/** In-game header: the site header with round, room code and player count on the right. */
export function GameHeader({ round, totalRounds, roomCode, playerCount }: GameHeaderProps) {
  return (
    <SiteHeader
      right={
        <div className="flex items-center gap-2 sm:gap-3">
          {round !== undefined && totalRounds !== undefined && (
            <span className="rounded-full bg-violet-100 px-3 py-1.5 font-display text-xs font-semibold text-violet-700">
              Round {round}
              <span className="text-violet-400">/{totalRounds}</span>
            </span>
          )}
          <span className="hidden items-center gap-1.5 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-plum-500 sm:inline-flex">
            Room <span className="font-display text-xs tracking-[0.18em] text-plum-700">{roomCode}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-plum-600">
            <Users className="size-3.5" aria-hidden />
            {playerCount}
          </span>
        </div>
      }
    />
  );
}
