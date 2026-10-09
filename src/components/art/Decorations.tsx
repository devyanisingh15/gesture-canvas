import { cn } from "@/lib/cn";

export function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 text-pink-400", className)} aria-hidden>
      <path
        d="M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7 6.2 20.1l1.5-6.5-5-4.4 6.6-.6z"
        fill="currentColor"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 text-white", className)} aria-hidden>
      <path d="M12 2c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" fill="currentColor" />
    </svg>
  );
}

/** Faint floating dots and glows that sit behind every screen. */
export function BackgroundDecor() {
  const dots = [
    [6, 18], [14, 62], [22, 34], [31, 84], [38, 12], [47, 56], [55, 28], [63, 76],
    [71, 14], [78, 48], [86, 88], [93, 30], [9, 92], [42, 70], [67, 40], [96, 64],
  ] as const;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-10 top-16 size-40 rounded-full bg-white/70 blur-2xl" />
      <div className="absolute right-[8%] top-[55%] size-56 rounded-full bg-pink-200/40 blur-3xl" />
      {dots.map(([x, y], i) => (
        <span
          key={i}
          className="absolute size-1.5 rounded-full bg-white/80"
          style={{ left: `${x}%`, top: `${y}%`, opacity: 0.4 + (i % 3) * 0.2 }}
        />
      ))}
    </div>
  );
}
