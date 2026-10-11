"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasPoint } from "@/features/gesture/types";
import { queryCameraPermission, type CameraErrorKind } from "@/services/camera";
import { useCamera } from "./useCamera";
import { useHandTracking } from "./useHandTracking";

export type HandInputError =
  | { source: "camera"; kind: CameraErrorKind; message: string }
  | { source: "tracking"; message: string };

/**
 * Webcam → hand detection → landmarks → draw gesture → fingertip position, in
 * one hook. The camera is only requested when the page calls start(), or
 * straight away when the browser already has permission (so a refresh mid-game
 * doesn't ask again). The stream stops when the component unmounts or the page
 * is hidden for navigation. No video or frames ever leave the browser.
 *
 * Re-renders only when a flag changes; per-frame data is read from
 * indexFingerPosition.current or received through subscribe().
 */
export function useHandInput() {
  const camera = useCamera();
  const tracking = useHandTracking(camera.videoRef, camera.status === "ready");
  const { start, stop } = camera;

  // "prompt": the page should explain and ask before the browser does.
  const [permission, setPermission] = useState<"checking" | "prompt" | "granted">("checking");
  useEffect(() => {
    let cancelled = false;
    void queryCameraPermission().then((state) => {
      if (cancelled) return;
      if (state === "granted") {
        setPermission("granted");
        void start();
      } else setPermission("prompt");
    });
    return () => {
      cancelled = true;
    };
  }, [start]);

  // Leaving the page (or it going into the back/forward cache) turns the camera off;
  // coming back from that cache turns it on again.
  const wasOn = useRef(false);
  const statusRef = useRef(camera.status);
  statusRef.current = camera.status;
  useEffect(() => {
    const onHide = () => {
      wasOn.current = statusRef.current === "ready";
      stop();
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && wasOn.current) void start();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [start, stop]);

  const { latest } = tracking;
  const indexFingerPosition = useMemo(
    () => ({
      /** Smoothed fingertip in canvas space (0..1, mirrored), or null when no hand. */
      get current(): CanvasPoint | null {
        return latest.current?.indexTip ?? null;
      },
    }),
    [latest],
  );

  const error: HandInputError | null = camera.error
    ? { source: "camera", kind: camera.error.kind, message: camera.error.message }
    : tracking.error
      ? { source: "tracking", message: tracking.error }
      : null;

  return {
    isCameraReady: camera.status === "ready",
    isTracking: tracking.status === "running",
    handDetected: tracking.handDetected,
    /** Index finger extended, confidently tracked: the pen is down. */
    isDrawingGesture: tracking.indexExtended,
    indexFingerPosition,
    error,
    /** True once the page should show its own camera prompt (permission not granted yet). */
    needsPermission: permission === "prompt",
    /** Per-frame updates, for cursors, overlays and drawing. Returns the unsubscribe function. */
    subscribe: tracking.subscribe,
    start,
    stop,
    retry: tracking.retry,
    camera,
    tracking,
  };
}

export type HandInput = ReturnType<typeof useHandInput>;
