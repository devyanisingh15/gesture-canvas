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

  const stop = useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mounted.current) setStatus("idle");
  }, []);

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
  }, []);

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
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [autoStart, start]);

  return { videoRef, attachVideo, status, error, start, stop };
}

export type CameraController = ReturnType<typeof useCamera>;
