import { Crown, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { PlayerView } from "@/features/game/types";
import { cn } from "@/lib/cn";

interface PlayerCardProps {
  player: PlayerView;
  variant?: "tile" | "row";
  trailing?: React.ReactNode;
  className?: string;
}

/** A player in the lobby grid (tile) or a list (row). */
export function PlayerCard({ player, variant = "tile", trailing, className }: PlayerCardProps) {
  const offline = player.connection !== "connected";

  if (variant === "row") {
    return (
      <div className={cn("flex items-center gap-3 rounded-2xl border-2 border-white bg-cream-50 px-3 py-2.5 shadow-soft", className)}>
        <Avatar name={player.name} color={player.avatar} size="sm" className={cn(offline && "grayscale")} />
        <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-plum-700">
          {player.name}
          {player.isYou && player.name !== "You" && <span className="text-plum-400"> (you)</span>}
        </span>
        {player.isHost && <Crown className="size-4 text-sun-400" aria-label="Host" />}
        {offline && <WifiOff className="size-4 text-danger-500" aria-label="Disconnected" />}
        {trailing}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-card border-2 border-white bg-cream-50 px-3 pb-4 pt-5 shadow-card animate-fade-up",
        player.isYou && "border-violet-300 ring-4 ring-violet-100",
        className,
      )}
    >
      {player.isHost && (
        <span className="absolute -top-2.5 inline-flex items-center gap-1 rounded-full border border-sun-300 bg-sun-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-sun-600">
          <Crown className="size-3" aria-hidden /> Host
        </span>
      )}
      <Avatar name={player.name} color={player.avatar} size="lg" className={cn(offline && "grayscale")} />
      <span className="max-w-full truncate font-display text-base font-semibold text-plum-700">{player.name}</span>
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em]",
          offline
            ? "bg-danger-100 text-danger-500"
            : player.isReady
              ? "bg-mint-100 text-mint-700"
              : "bg-violet-100 text-violet-600",
        )}
      >
        {offline ? "Offline" : player.isReady ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

/** Dashed placeholder for an open seat in the lobby. */
export function EmptySeat() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-violet-200 bg-white/40 px-3 pb-4 pt-5 text-center">
      <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-violet-200 font-display text-2xl text-violet-300">
        +
      </span>
      <span className="text-xs font-bold text-plum-400">Waiting for player…</span>
    </div>
  );
}
