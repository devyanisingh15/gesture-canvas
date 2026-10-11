"use client";

import { useEffect, useRef, useState } from "react";
import { msUntilNextSecond, secondsLeft } from "@/features/game/clock";

/**
 * The countdown for real games: whole seconds left until a deadline set by the
 * server (45, 44, … 1, 0), on the server's clock. It changes exactly when the
 * second does, so every player's display turns over together, and a player who
 * reloads or reconnects picks it up at the right number.
 */
export function useServerCountdown(endsAt: number | null, serverNow: () => number): number {
  const [seconds, setSeconds] = useState(() => secondsLeft(endsAt, serverNow()));
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      const now = serverNow();
      setSeconds(secondsLeft(endsAt, now));
      const wait = msUntilNextSecond(endsAt, now);
      // A few ms late rather than early, so the next tick lands past the boundary.
      if (wait !== null) timer = window.setTimeout(tick, wait + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [endsAt, serverNow]);
  return seconds;
}

/**
 * Local countdown for the design previews (/game/*), which have no server.
 * Real games use useServerCountdown.
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
