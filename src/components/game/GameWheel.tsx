"use client";

import { useEffect, useState } from "react";
import { PromptArt } from "@/components/art/PromptArt";
import { PROMPTS } from "@/features/game/prompts";
import type { PromptId } from "@/features/game/types";
import { cn } from "@/lib/cn";

const SEGMENT_COLORS = ["#ede6ff", "#fde4ef", "#fff6d6", "#d6f6e4", "#e6efff"] as const;
const SPIN_MS = 4200;

interface GameWheelProps {
  /** Target chosen by the server; the wheel only animates to it. */
  targetId: PromptId;
  spinning: boolean;
  onSpinEnd?: () => void;
  className?: string;
}

/** Prize wheel of the 10 prompts with a pointer at the top. */
export function GameWheel({ targetId, spinning, onSpinEnd, className }: GameWheelProps) {
  const count = PROMPTS.length;
  const slice = 360 / count;
  const targetIndex = Math.max(0, PROMPTS.findIndex((p) => p.id === targetId));
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!spinning) return;
    const landing = 360 * 6 - (targetIndex * slice + slice / 2);
    setRotation(landing);
    const id = window.setTimeout(() => onSpinEnd?.(), SPIN_MS);
    return () => window.clearTimeout(id);
    // onSpinEnd is intentionally not a dependency: a new callback must not restart the spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, targetIndex, slice]);

  const gradient = `conic-gradient(${PROMPTS.map((_, i) => {
    const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
    return `${color} ${i * slice}deg ${(i + 1) * slice}deg`;
  }).join(", ")})`;

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[420px]", className)}>
      <div className="absolute inset-[-14px] rounded-full border-2 border-dashed border-violet-300/70" aria-hidden />
      <div className="absolute inset-0 rounded-full bg-white p-3 shadow-card">
        <div
          className="relative size-full rounded-full border-4 border-violet-200"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.2, 1)` : "none",
          }}
        >
          {PROMPTS.map((p, i) => {
            const angle = i * slice + slice / 2;
            const rad = (angle * Math.PI) / 180;
            return (
              <span key={p.id}>
                <span
                  aria-hidden
                  className="absolute left-1/2 top-0 h-1/2 w-0.5 origin-bottom -translate-x-1/2 bg-white/90"
                  style={{ transform: `rotate(${i * slice}deg)` }}
                />
                <span
                  className="absolute flex w-14 flex-col items-center gap-0.5"
                  style={{
                    left: `${50 + Math.sin(rad) * 34}%`,
                    top: `${50 - Math.cos(rad) * 34}%`,
                    transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                  }}
                >
                  <PromptArt promptId={p.id} className="size-8 sm:size-9" strokeWidth={2.4} />
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-plum-600 sm:text-[10px]">
                    {p.label}
                  </span>
                </span>
              </span>
            );
          })}
        </div>
      </div>
      {/* Hub */}
      <div className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-violet-400 to-violet-600 shadow-clay-violet">
        <span className="font-display text-sm font-bold uppercase tracking-wider text-white">Spin</span>
      </div>
      {/* Pointer */}
      <svg viewBox="0 0 40 44" className="absolute left-1/2 top-[-22px] w-10 -translate-x-1/2 drop-shadow-[0_4px_0_#c94a7f]" aria-hidden>
        <path d="M20 42L4 12a16 16 0 1132 0z" fill="#f48fb9" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="20" cy="15" r="5" fill="#fff" />
      </svg>
    </div>
  );
}
