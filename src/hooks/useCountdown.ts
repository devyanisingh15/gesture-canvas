"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Client-side countdown for the Phase 1 mock. In Phase 4 the remaining time
 * is derived from the server's phase_ends_at timestamp instead.
 */
export function useCountdown(totalSeconds: number, { running = true, onEnd }: { running?: boolean; onEnd?: () => void } = {}) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    setRemaining(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          onEndRef.current?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, totalSeconds]);

  return remaining;
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
