import Link from "next/link";
import { cn } from "@/lib/cn";

/** Logo tile + "GESTURE CANVAS" wordmark from the site header. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label="Gesture Canvas home">
      <LogoMark />
      <span className="font-display text-[13px] font-bold uppercase tracking-[0.02em] text-plum-700">
        Gesture <span className="text-violet-500">Canvas</span>
      </span>
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-[30px] items-center justify-center rounded-[10px] bg-gradient-to-b from-violet-400 to-violet-600 shadow-[0_3px_0_0_#5b34b5,0_8px_14px_-6px_rgb(124_77_219/0.6)]",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <rect x="3" y="5" width="2.2" height="7" rx="1.1" fill="#fff" />
        <rect x="6.9" y="3" width="2.2" height="9" rx="1.1" fill="#fff" />
        <rect x="10.8" y="6" width="2.2" height="6" rx="1.1" fill="#fff" opacity="0.85" />
      </svg>
    </span>
  );
}
