import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "teal" | "violet" | "mint" | "pink" | "sun" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  teal: "bg-teal-50 border-teal-200 text-plum-700",
  violet: "bg-violet-100 border-violet-200 text-violet-700",
  mint: "bg-mint-100 border-mint-200 text-mint-700",
  pink: "bg-pink-100 border-pink-200 text-pink-600",
  sun: "bg-sun-100 border-sun-200 text-sun-600",
  danger: "bg-danger-100 border-danger-400/40 text-danger-500",
  neutral: "bg-white/70 border-plum-300/40 text-plum-500",
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  uppercase?: boolean;
  className?: string;
  children: ReactNode;
}

/** Small pill label, e.g. "Multiplayer gesture game" or "HOW IT WORKS". */
export function Badge({ tone = "violet", dot, uppercase, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold leading-none",
        uppercase && "uppercase tracking-[0.14em]",
        TONES[tone],
        className,
      )}
    >
      {dot && <StatusDot tone={tone === "danger" ? "danger" : tone === "sun" ? "sun" : "mint"} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "mint", pulse }: { tone?: "mint" | "danger" | "sun" | "neutral"; pulse?: boolean }) {
  const color = {
    mint: "bg-mint-400 ring-mint-100",
    danger: "bg-danger-500 ring-danger-100",
    sun: "bg-sun-400 ring-sun-100",
    neutral: "bg-plum-300 ring-white",
  }[tone];
  return <span aria-hidden className={cn("inline-block size-2 rounded-full ring-[3px]", color, pulse && "animate-blink")} />;
}
