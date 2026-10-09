import { formatClock } from "@/hooks/useCountdown";
import { cn } from "@/lib/cn";

interface GameTimerProps {
  remaining: number;
  total: number;
  variant?: "ring" | "inline";
  className?: string;
}

/** Countdown display. Turns pink and pulses in the last 10 seconds. */
export function GameTimer({ remaining, total, variant = "ring", className }: GameTimerProps) {
  const urgent = remaining <= 10;
  const label = formatClock(remaining);

  if (variant === "inline") {
    return (
      <span
        role="timer"
        aria-live="off"
        className={cn("font-display text-lg font-bold tabular-nums", urgent ? "text-pink-500" : "text-plum-700", className)}
      >
        {label}
      </span>
    );
  }

  const r = 34;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? remaining / total : 0;
  return (
    <div role="timer" aria-label={`${remaining} seconds left`} className={cn("relative size-[88px]", urgent && "animate-wiggle", className)}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="#fffdf8" stroke="#ede6ff" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={urgent ? "#ec6fa3" : "#8b5cf6"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-display text-lg font-bold tabular-nums",
          urgent ? "text-pink-500" : "text-plum-700",
        )}
      >
        {label}
      </span>
    </div>
  );
}
