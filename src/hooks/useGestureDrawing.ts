"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { clampPoint, drawingReducer, initialDrawingState, MIN_POINT_DISTANCE, type DrawingState } from "@/features/drawing/drawingReducer";
import type { Drawing, Point, Stroke } from "@/features/drawing/types";
import type { HandTracking } from "./useHandTracking";

interface Options {
  enabled: boolean;
  /** A drawing to continue from (read once, when the hook mounts). */
  initial?: Drawing | null;
  color?: string;
  width?: number;
}

/** How often the stroke in progress is committed to React state (ms). The canvas shows it every frame regardless. */
const COMMIT_EVERY_MS = 200;

/** The stroke in progress, readable every frame without a React render (DrawingCanvas's `live` prop). */
export interface LiveStroke {
  get(): Stroke | null;
  subscribe(fn: () => void): () => void;
}

let strokeCounter = 0;
const newStrokeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `stroke-${Date.now()}-${++strokeCounter}`;

/**
 * Turns hand-tracking frames into stroke data:
 * index finger extended → start or continue a stroke;
 * finger curled, open hand, low confidence or hand gone → end the stroke.
 * It knows nothing about the camera or the canvas.
 *
 * Points reach React state in batches (a few times a second, and whenever a
 * stroke starts or ends); every frame's point is available right away through
 * `live`, so the canvas follows the finger without re-rendering the page.
 */
export function useGestureDrawing(tracking: Pick<HandTracking, "subscribe">, { enabled, initial, color, width }: Options) {
  const [state, dispatch] = useReducer(drawingReducer, initial, (d): DrawingState => (d ? { drawing: d, activeStrokeId: null } : initialDrawingState));
  // The stroke in progress with every point so far, ahead of state by up to COMMIT_EVERY_MS.
  const liveRef = useRef<Stroke | null>(null);
  const pending = useRef<Point[]>([]);
  const lastCommit = useRef(0);
  const liveListeners = useRef(new Set<() => void>());
  const { subscribe } = tracking;

  const live = useMemo<LiveStroke>(
    () => ({
      get: () => liveRef.current,
      subscribe: (fn) => {
        liveListeners.current.add(fn);
        return () => {
          liveListeners.current.delete(fn);
        };
      },
    }),
    [],
  );
  const notify = () => liveListeners.current.forEach((fn) => fn());

  const commit = useCallback(() => {
    if (pending.current.length) dispatch({ type: "stroke/append", points: pending.current });
    pending.current = [];
    lastCommit.current = performance.now();
  }, []);

  const endStroke = useCallback(() => {
    if (!liveRef.current) return;
    commit();
    liveRef.current = null;
    dispatch({ type: "stroke/end" });
  }, [commit]);

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
      const point = clampPoint({
        x: frame.indexTip.x,
        y: frame.indexTip.y,
        timestamp: Math.round(performance.timeOrigin + frame.timestamp),
      });
      const stroke = liveRef.current;
      if (!stroke) {
        const id = newStrokeId();
        liveRef.current = { id, points: [point], ...(color && { color }), ...(width && { width }) };
        pending.current = [];
        lastCommit.current = performance.now();
        dispatch({ type: "stroke/start", id, point, color, width });
      } else {
        // Same rule as the reducer, so the committed stroke ends up identical.
        const prev = stroke.points[stroke.points.length - 1];
        if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) < MIN_POINT_DISTANCE) return;
        stroke.points.push(point);
        pending.current.push(point);
        if (performance.now() - lastCommit.current >= COMMIT_EVERY_MS) commit();
      }
      notify();
    });
    return () => {
      unsubscribe();
      endStroke();
    };
  }, [subscribe, enabled, color, width, endStroke, commit]);

  const undo = useCallback(() => {
    liveRef.current = null;
    pending.current = [];
    dispatch({ type: "undo" });
  }, []);

  const clear = useCallback(() => {
    liveRef.current = null;
    pending.current = [];
    dispatch({ type: "clear" });
  }, []);

  return {
    drawing: state.drawing,
    strokes: state.drawing.strokes,
    activeStrokeId: state.activeStrokeId,
    isDrawing: state.activeStrokeId !== null,
    live,
    undo,
    clear,
  };
}
