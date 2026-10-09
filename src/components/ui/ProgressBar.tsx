import { cn } from "@/lib/cn";

type Tone = "violet" | "pink" | "sun" | "mint";

const FILLS: Record<Tone, string> = {
  violet: "from-violet-400 to-violet-500",
  pink: "from-pink-300 to-pink-500",
  sun: "from-sun-300 to-sun-400",
  mint: "from-mint-200 to-mint-400",
};

interface ProgressBarProps {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}

export function ProgressBar({ value, tone = "violet", className, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("h-2.5 overflow-hidden rounded-full bg-violet-100", className)}
    >
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out", FILLS[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
