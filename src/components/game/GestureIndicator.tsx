import type { GestureStatus } from "@/features/game/types";
import { cn } from "@/lib/cn";

const STYLES: Record<GestureStatus, { label: string; chip: string; dot: string }> = {
  starting: { label: "Starting camera", chip: "bg-white/80 border-violet-200 text-plum-500", dot: "bg-plum-300 ring-white animate-blink" },
  detected: { label: "Hand detected", chip: "bg-mint-100 border-mint-200 text-plum-700", dot: "bg-mint-400 ring-mint-50" },
  drawing: { label: "Drawing", chip: "bg-violet-100 border-violet-200 text-violet-700", dot: "bg-violet-500 ring-violet-50 animate-blink" },
  "not-detected": {
    label: "Hand not detected",
    chip: "bg-danger-100 border-danger-400/40 text-danger-500",
    dot: "bg-danger-500 ring-white animate-blink",
  },
};

/** "Hand detected" chip from the hero game card. */
export function GestureIndicator({ status, className }: { status: GestureStatus; className?: string }) {
  const s = STYLES[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 font-display text-[15px] font-semibold shadow-[0_3px_0_0_rgb(74_45_110/0.08)]",
        s.chip,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full ring-[3px]", s.dot)} />
      {s.label}
    </span>
  );
}
