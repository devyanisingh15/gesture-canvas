"use client";

import { useEffect, useRef, useState } from "react";
import type { HandFrame } from "@/features/gesture/types";

const STORAGE_KEY = "gesture-canvas:debug";

/**
 * Whether the hand-tracking debug view is on: `?debug=hand` in the URL turns it
 * on (and remembers it for this browser), `?debug=off` turns it off again.
 */
export function useHandDebug(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get("debug");
      if (param === "hand") localStorage.setItem(STORAGE_KEY, "hand");
      if (param === "off") localStorage.removeItem(STORAGE_KEY);
      setOn(param === "hand" || (param !== "off" && localStorage.getItem(STORAGE_KEY) === "hand"));
    } catch {
      setOn(new URLSearchParams(window.location.search).get("debug") === "hand");
    }
  }, []);
  return on;
}

interface HandTrackingDebugProps {
  subscribe: (fn: (frame: HandFrame) => void) => () => void;
}

/**
 * Debug readout for hand tracking: fingertip position, gesture, confidence and
 * frame rate, plus a crosshair on the fingertip. Place it inside the drawing
 * area (DrawingCanvas children). Written straight to the DOM every frame, so it
 * costs no React renders.
 */
export function HandTrackingDebug({ subscribe }: HandTrackingDebugProps) {
  const textRef = useRef<HTMLPreElement | null>(null);
  const crossRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const times: number[] = [];
    return subscribe((frame) => {
      times.push(frame.timestamp);
      while (times.length > 1 && frame.timestamp - times[0]! > 1000) times.shift();
      const fps = times.length > 1 ? ((times.length - 1) * 1000) / (frame.timestamp - times[0]!) : 0;
      const tip = frame.indexTip;
      const gesture = !frame.handDetected ? "no hand" : frame.indexExtended ? "index up: DRAW" : "pen up";
      const text = [
        `hand      ${frame.handDetected ? "yes" : "no"}${frame.handDetected && !frame.landmarks ? " (held)" : ""}`,
        `gesture   ${gesture}`,
        `conf      ${frame.confidence === null ? "-" : frame.confidence.toFixed(2)}`,
        `tip       ${tip ? `${tip.x.toFixed(3)}, ${tip.y.toFixed(3)}` : "-"}`,
        `fps       ${fps.toFixed(0)}`,
      ].join("\n");
      if (textRef.current) textRef.current.textContent = text;
      const cross = crossRef.current;
      if (cross) {
        cross.style.display = tip ? "block" : "none";
        if (tip) {
          cross.style.left = `${tip.x * 100}%`;
          cross.style.top = `${tip.y * 100}%`;
          cross.style.borderColor = frame.indexExtended ? "#16a34a" : "#dc2626";
        }
      }
    });
  }, [subscribe]);

  return (
    <>
      <span
        ref={crossRef}
        aria-hidden
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{ display: "none" }}
      />
      <pre
        ref={textRef}
        data-testid="hand-debug"
        className="pointer-events-none absolute left-1 top-1 rounded-md bg-black/70 px-2 py-1 font-mono text-[10px] leading-snug text-white"
      >
        waiting for frames…
      </pre>
    </>
  );
}
