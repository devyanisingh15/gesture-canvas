"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingEngine } from "@/features/drawing/engine";
import type { Drawing } from "@/features/drawing/types";
import type { HandTracking } from "./useHandTracking";

interface Options {
  enabled: boolean;
  /** A drawing to continue from (read once, when the hook mounts). */
  initial?: Drawing | null;
  /** Called with a plain copy of the drawing after every change, without a React render. */
  onChange?: (drawing: Drawing) => void;
  color?: string;
  width?: number;
}

let strokeCounter = 0;
const newStrokeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `stroke-${Date.now()}-${++strokeCounter}`;

/**
 * Turns hand-tracking frames into strokes on a DrawingEngine:
 * index finger extended → begin or continue a stroke;
 * finger curled, open hand, low confidence, finger off the canvas or hand gone → end it.
 *
 * The drawing lives in the engine, not in React state: points are added
 * without a render, DrawingCanvas paints from the engine, and the page only
 * re-renders when a stroke starts or ends (for the Undo button and counts).
 */
export function useGestureDrawing(tracking: Pick<HandTracking, "subscribe">, { enabled, initial, onChange, color, width }: Options) {
  const [engine] = useState(() => new DrawingEngine(initial));
  const [strokeCount, setStrokeCount] = useState(() => engine.strokes.length);
  const [isDrawing, setIsDrawing] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { subscribe } = tracking;

  useEffect(() => {
    // Report the starting drawing too (empty, or resumed), so a player who draws nothing still hands in.
    onChangeRef.current?.(engine.toDrawing());
    return engine.subscribe((change) => {
      onChangeRef.current?.(engine.toDrawing());
      if (change === "strokes") {
        setStrokeCount(engine.strokes.length);
        setIsDrawing(engine.isDrawing);
      }
    });
  }, [engine]);

  useEffect(() => {
    if (!enabled) {
      engine.endStroke();
      return;
    }
    const unsubscribe = subscribe((frame) => {
      if (!frame.handDetected || !frame.indexExtended || !frame.indexTip) {
        engine.endStroke();
        return;
      }
      const point = { x: frame.indexTip.x, y: frame.indexTip.y, timestamp: Math.round(performance.timeOrigin + frame.timestamp) };
      if (engine.isDrawing) engine.addPoint(point);
      else engine.beginStroke(newStrokeId(), point, { color, width });
    });
    return () => {
      unsubscribe();
      engine.endStroke();
    };
  }, [engine, subscribe, enabled, color, width]);

  const undo = useCallback(() => engine.undo(), [engine]);
  const clear = useCallback(() => engine.clear(), [engine]);

  return { engine, strokeCount, isDrawing, undo, clear };
}
