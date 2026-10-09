"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke, StrokePoint } from "@/features/game/types";
import type { HandTracking } from "./useHandTracking";

/** Skip points closer than this (canvas fraction) to the previous one. */
const MIN_POINT_DISTANCE = 0.004;

interface Options {
  enabled: boolean;
  color?: string;
  width?: number;
}

/**
 * Turns the index-finger gesture into strokes. A stroke starts when the
 * finger extends and ends when it curls or the hand leaves the frame.
 * Knows nothing about the camera; it only listens to hand-tracking frames.
 */
export function useGestureDrawing(tracking: Pick<HandTracking, "subscribe">, { enabled, color = "#8b5cf6", width = 4 }: Options) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const counter = useRef(0);
  const startedAt = useRef<number | null>(null);
  const { subscribe } = tracking;

  const endStroke = useCallback(() => {
    const stroke = current.current;
    current.current = null;
    // A single point renders as nothing; drop it.
    if (stroke && stroke.points.length < 2) setStrokes((s) => s.filter((x) => x.id !== stroke.id));
  }, []);

  useEffect(() => {
    if (!enabled) {
      endStroke();
      return;
    }
    return subscribe((frame) => {
      if (!frame.handDetected || !frame.indexExtended || !frame.indexTip) {
        if (current.current) endStroke();
        return;
      }
      startedAt.current ??= frame.timestamp;
      const point: StrokePoint = { x: frame.indexTip.x, y: frame.indexTip.y, t: Math.round(frame.timestamp - startedAt.current) };
      const stroke = current.current;
      if (!stroke) {
        const next: Stroke = { id: `stroke-${++counter.current}`, color, width, points: [point] };
        current.current = next;
        setStrokes((s) => [...s, next]);
        return;
      }
      const last = stroke.points[stroke.points.length - 1]!;
      if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) return;
      const updated: Stroke = { ...stroke, points: [...stroke.points, point] };
      current.current = updated;
      setStrokes((s) => (s.length && s[s.length - 1]!.id === updated.id ? [...s.slice(0, -1), updated] : [...s, updated]));
    });
  }, [subscribe, enabled, color, width, endStroke]);

  const undo = useCallback(() => {
    current.current = null;
    setStrokes((s) => s.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    current.current = null;
    setStrokes([]);
  }, []);

  return { strokes, undo, clear };
}
