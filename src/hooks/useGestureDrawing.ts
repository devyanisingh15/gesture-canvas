"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { drawingReducer, initialDrawingState, type DrawingState } from "@/features/drawing/drawingReducer";
import type { Drawing, Point } from "@/features/drawing/types";
import type { HandTracking } from "./useHandTracking";

interface Options {
  enabled: boolean;
  /** A drawing to continue from (read once, when the hook mounts). */
  initial?: Drawing | null;
  color?: string;
  width?: number;
}

let strokeCounter = 0;
const newStrokeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `stroke-${Date.now()}-${++strokeCounter}`;

/**
 * Turns hand-tracking frames into stroke data:
 * index finger extended → start or continue a stroke;
 * finger curled, open hand, or hand gone → end the stroke.
 * It knows nothing about the camera or the canvas.
 */
export function useGestureDrawing(tracking: Pick<HandTracking, "subscribe">, { enabled, initial, color, width }: Options) {
  const [state, dispatch] = useReducer(drawingReducer, initial, (d): DrawingState => (d ? { drawing: d, activeStrokeId: null } : initialDrawingState));
  // Mirrors state.activeStrokeId synchronously, since frames arrive faster than renders.
  const activeRef = useRef<string | null>(null);
  const { subscribe } = tracking;

  const endStroke = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = null;
    dispatch({ type: "stroke/end" });
  }, []);

  useEffect(() => {
    if (!enabled) {
      endStroke();
      return;
    }
    const unsubscribe = subscribe((frame) => {
      if (!frame.handDetected || !frame.indexExtended || !frame.indexTip) {
        endStroke();
        return;
      }
      const point: Point = {
        x: frame.indexTip.x,
        y: frame.indexTip.y,
        timestamp: Math.round(performance.timeOrigin + frame.timestamp),
      };
      if (!activeRef.current) {
        const id = newStrokeId();
        activeRef.current = id;
        dispatch({ type: "stroke/start", id, point, color, width });
      } else {
        dispatch({ type: "stroke/continue", point });
      }
    });
    return () => {
      unsubscribe();
      endStroke();
    };
  }, [subscribe, enabled, color, width, endStroke]);

  const undo = useCallback(() => {
    activeRef.current = null;
    dispatch({ type: "undo" });
  }, []);

  const clear = useCallback(() => {
    activeRef.current = null;
    dispatch({ type: "clear" });
  }, []);

  return {
    drawing: state.drawing,
    strokes: state.drawing.strokes,
    activeStrokeId: state.activeStrokeId,
    isDrawing: state.activeStrokeId !== null,
    undo,
    clear,
  };
}
