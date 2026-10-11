"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { HandFrameProcessor, noHandFrame, type HandDetection } from "@/features/gesture/handFrameProcessor";
import type { HandFrame, TrackerStatus } from "@/features/gesture/types";
import { createHandTracker, HandTrackingUnsupportedError, type HandTracker } from "@/services/handTracking";

/** Consecutive frames the model fails on before tracking counts as broken (and offers a retry). */
const MAX_DETECT_FAILURES = 15;

type Listener = (frame: HandFrame) => void;

export interface HandTrackingState {
  status: TrackerStatus;
  error: string | null;
  handDetected: boolean;
  indexExtended: boolean;
}

const IDLE: HandTrackingState = { status: "idle", error: null, handDetected: false, indexExtended: false };

/**
 * Runs MediaPipe hand tracking on a playing <video>. React state only changes
 * when detection state changes; per-frame data (cursor position, landmarks)
 * goes to subscribers so the page doesn't re-render 30 times a second.
 * Nothing leaves the browser: frames are read from the <video> and dropped.
 */
export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [state, setState] = useState<HandTrackingState>(IDLE);
  const listeners = useRef(new Set<Listener>());
  const latest = useRef<HandFrame | null>(null);
  const [attempt, setAttempt] = useState(0);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === "idle" && !s.error ? s : IDLE));
      return;
    }
    let cancelled = false;
    let tracker: HandTracker | null = null;
    let rafId = 0;
    let videoCbId = 0;
    let failures = 0;
    const processor = new HandFrameProcessor();
    let shownDetected = false;
    let shownExtended = false;

    const publish = (frame: HandFrame) => {
      latest.current = frame;
      listeners.current.forEach((fn) => fn(frame));
      if (frame.handDetected !== shownDetected || frame.indexExtended !== shownExtended) {
        shownDetected = frame.handDetected;
        shownExtended = frame.indexExtended;
        setState((s) => ({ ...s, handDetected: frame.handDetected, indexExtended: frame.indexExtended }));
      }
    };

    const fail = (message: string) => {
      cancelled = true;
      tracker?.close();
      tracker = null;
      latest.current = null;
      listeners.current.forEach((fn) => fn(noHandFrame(performance.now())));
      setState({ status: "error", error: message, handDetected: false, indexExtended: false });
    };

    const process = () => {
      const video = videoRef.current;
      if (cancelled || !tracker || !video) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const now = performance.now();
        let detection: HandDetection | null = null;
        try {
          detection = tracker.detect(video, now);
          failures = 0;
        } catch {
          // One bad frame lifts the pen; many in a row means the model has broken down.
          if (++failures >= MAX_DETECT_FAILURES) return fail("Hand tracking stopped working.");
        }
        publish(processor.next(detection, now));
      }
      schedule();
    };

    const schedule = () => {
      const video = videoRef.current;
      if (cancelled || !video) return;
      if ("requestVideoFrameCallback" in video) {
        videoCbId = video.requestVideoFrameCallback(() => process());
      } else {
        rafId = requestAnimationFrame(process);
      }
    };

    setState({ status: "loading", error: null, handDetected: false, indexExtended: false });
    createHandTracker()
      .then((t) => {
        if (cancelled) {
          t.close();
          return;
        }
        tracker = t;
        setState((s) => ({ ...s, status: "running" }));
        schedule();
      })
      .catch((err: unknown) => {
        if (!cancelled) fail(err instanceof HandTrackingUnsupportedError ? err.message : "Hand tracking couldn't start.");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const video = videoRef.current;
      if (video && videoCbId && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(videoCbId);
      tracker?.close();
      tracker = null;
      latest.current = null;
      listeners.current.forEach((fn) => fn(noHandFrame(performance.now())));
    };
  }, [enabled, videoRef, attempt]);

  return { ...state, subscribe, retry, latest };
}

export type HandTracking = ReturnType<typeof useHandTracking>;
