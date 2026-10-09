"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraError, requestCameraStream, stopCameraStream, toCameraError } from "@/services/camera";

export type CameraStatus = "idle" | "requesting" | "ready" | "error";

/**
 * Owns the webcam stream: requests permission, attaches the stream to a
 * <video>, and stops every track when the component unmounts.
 */
export function useCamera({ autoStart = false }: { autoStart?: boolean } = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);
  const mounted = useRef(true);
  const watchRef = useRef<number | null>(null);

  const unwatch = useCallback(() => {
    if (watchRef.current !== null) window.clearInterval(watchRef.current);
    watchRef.current = null;
  }, []);

  /** The camera went away mid-game (unplugged, revoked, taken by another app). */
  const handleLost = useCallback(() => {
    if (!streamRef.current) return;
    unwatch();
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!mounted.current) return;
    setError(new CameraError("disconnected", "The camera disconnected."));
    setStatus("error");
  }, [unwatch]);

  // "ended" fires when the device goes away; polling also catches tracks stopped by the browser or OS.
  const watch = useCallback(
    (stream: MediaStream) => {
      stream.getVideoTracks().forEach((t) => t.addEventListener("ended", handleLost));
      watchRef.current = window.setInterval(() => {
        if (stream.getVideoTracks().every((t) => t.readyState === "ended")) handleLost();
      }, 500);
    },
    [handleLost],
  );

  const stop = useCallback(() => {
    unwatch();
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mounted.current) setStatus("idle");
  }, [unwatch]);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setStatus("requesting");
    setError(null);
    try {
      const stream = await requestCameraStream();
      if (!mounted.current) {
        stopCameraStream(stream);
        return;
      }
      streamRef.current = stream;
      watch(stream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus("ready");
    } catch (err) {
      if (!mounted.current) return;
      setError(toCameraError(err));
      setStatus("error");
    }
  }, [watch]);

  // Attach the stream if the <video> mounts after the stream started.
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (autoStart) void start();
    return () => {
      mounted.current = false;
      unwatch();
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [autoStart, start, unwatch]);

  return { videoRef, attachVideo, status, error, start, stop };
}

export type CameraController = ReturnType<typeof useCamera>;
