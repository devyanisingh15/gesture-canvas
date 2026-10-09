"use client";

import { useEffect, useRef } from "react";
import type { HandFrame } from "@/features/gesture/types";

interface GestureCursorProps {
  subscribe: (fn: (frame: HandFrame) => void) => () => void;
}

/**
 * Fingertip cursor that follows the tracked index finger. Must be placed inside
 * the drawing area (DrawingCanvas children) so both share coordinates.
 * Positioned directly on the DOM to avoid a React render per camera frame.
 */
export function GestureCursor({ subscribe }: GestureCursorProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(
    () =>
      subscribe((frame) => {
        const el = ref.current;
        if (!el) return;
        if (!frame.indexTip) {
          el.style.opacity = "0";
          return;
        }
        el.style.opacity = "1";
        el.style.left = `${frame.indexTip.x * 100}%`;
        el.style.top = `${frame.indexTip.y * 100}%`;
        el.dataset.drawing = String(frame.indexExtended);
      }),
    [subscribe],
  );

  return (
    <span
      ref={ref}
      aria-hidden
      data-drawing="false"
      className="group pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150"
      style={{ left: "50%", top: "50%" }}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-violet-200/60 group-data-[drawing=true]:animate-pulse-ring">
        <span className="size-3 rounded-full border-2 border-violet-500 bg-white ring-2 ring-white transition-colors group-data-[drawing=true]:bg-violet-500" />
      </span>
      <svg viewBox="0 0 24 24" className="absolute left-5 top-4 size-4 text-plum-700" aria-hidden>
        <path
          d="M9 11V5.5a1.5 1.5 0 013 0V10m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5a6 6 0 01-6 6h-1.2a5 5 0 01-4-2L4.5 15a1.5 1.5 0 012.3-1.9L9 15"
          fill="#fff"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
