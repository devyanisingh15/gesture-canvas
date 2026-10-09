"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { landmarkToCanvasPoint } from "@/features/gesture/coordinates";
import { isIndexFingerExtended, LANDMARK } from "@/features/gesture/landmarks";
import { PointFilter } from "@/features/gesture/oneEuroFilter";
import type { HandFrame, TrackerStatus } from "@/features/gesture/types";
import { createHandTracker, type HandTracker } from "@/services/handTracking";

/** Consecutive empty frames before the hand counts as gone: the pen lifts and the UI says "Hand not detected". */
const LOST_FRAMES = 4;
/** Consecutive frames a pose must hold before the draw state flips, to avoid flicker. */
const GESTURE_FRAMES = 2;

type Listener = (frame: HandFrame) => void;

export interface HandTrackingState {
  status: TrackerStatus;
  error: string | null;
  handDetected: boolean;
  indexExtended: boolean;
}

/**
 * Runs MediaPipe hand tracking on a playing <video>. React state only changes
 * when detection state changes; per-frame data (cursor position, landmarks)
 * goes to subscribers so the page doesn't re-render 30 times a second.
 */
export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [state, setState] = useState<HandTrackingState>({
    status: "idle",
    error: null,
    handDetected: false,
    indexExtended: false,
  });
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
      setState((s) => (s.status === "idle" && !s.error ? s : { status: "idle", error: null, handDetected: false, indexExtended: false }));
      return;
    }
    let cancelled = false;
    let tracker: HandTracker | null = null;
    let rafId = 0;
    let videoCbId = 0;
    const filter = new PointFilter();
    let missing = LOST_FRAMES;
    let poseFrames = 0;
    let drawPose = false;
    let shownDetected = false;
    let shownExtended = false;
    let lastTip: HandFrame["indexTip"] = null;

    const publish = (frame: HandFrame) => {
      latest.current = frame;
      listeners.current.forEach((fn) => fn(frame));
      const detected = frame.handDetected;
      if (detected !== shownDetected || frame.indexExtended !== shownExtended) {
        shownDetected = detected;
        shownExtended = frame.indexExtended;
        setState((s) => ({ ...s, handDetected: detected, indexExtended: frame.indexExtended }));
      }
    };

    const process = () => {
      const video = videoRef.current;
      if (cancelled || !tracker || !video) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const now = performance.now();
        let landmarks = null;
        try {
          landmarks = tracker.detect(video, now);
        } catch {
          landmarks = null;
        }
        if (!landmarks) {
          missing = Math.min(missing + 1, LOST_FRAMES);
          if (missing >= LOST_FRAMES) {
            // Hand is gone: pen up, cursor hidden, smoothing restarts on return.
            filter.reset();
            poseFrames = 0;
            drawPose = false;
            lastTip = null;
            publish({ timestamp: now, handDetected: false, indexExtended: false, indexTip: null, landmarks: null });
          } else {
            // A few dropped frames are normal; hold the last state so strokes don't break up.
            publish({ timestamp: now, handDetected: true, indexExtended: drawPose, indexTip: lastTip, landmarks: null });
          }
        } else {
          missing = 0;
          const extended = isIndexFingerExtended(landmarks);
          poseFrames = extended === drawPose ? 0 : poseFrames + 1;
          if (poseFrames >= GESTURE_FRAMES) {
            drawPose = extended;
            poseFrames = 0;
          }
          const tip = landmarks[LANDMARK.INDEX_TIP]!;
          lastTip = filter.filter(landmarkToCanvasPoint(tip), now);
          publish({ timestamp: now, handDetected: true, indexExtended: drawPose, indexTip: lastTip, landmarks });
        }
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
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "Hand tracking failed to load.",
          handDetected: false,
          indexExtended: false,
        });
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      const video = videoRef.current;
      if (video && videoCbId && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(videoCbId);
      tracker?.close();
      latest.current = null;
      listeners.current.forEach((fn) =>
        fn({ timestamp: performance.now(), handDetected: false, indexExtended: false, indexTip: null, landmarks: null }),
      );
    };
  }, [enabled, videoRef, attempt]);

  return { ...state, subscribe, retry, latest };
}

export type HandTracking = ReturnType<typeof useHandTracking>;
