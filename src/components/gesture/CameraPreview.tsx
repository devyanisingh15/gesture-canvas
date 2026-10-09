"use client";

import { useEffect, useRef } from "react";
import { HAND_CONNECTIONS } from "@/features/gesture/landmarks";
import type { HandFrame } from "@/features/gesture/types";
import type { CameraStatus } from "@/hooks/useCamera";
import { cn } from "@/lib/cn";

interface CameraPreviewProps {
  /** Ref callback from useCamera().attachVideo. */
  videoRef: (el: HTMLVideoElement | null) => void;
  cameraStatus: CameraStatus;
  /** Optional landmark overlay, fed by useHandTracking().subscribe. */
  subscribe?: (fn: (frame: HandFrame) => void) => () => void;
  className?: string;
}

/** Live, mirrored webcam feed with the tracked hand skeleton drawn on top. */
export function CameraPreview({ videoRef, cameraStatus, subscribe, className }: CameraPreviewProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((frame) => {
      const canvas = overlayRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const lm = frame.landmarks;
      // Keep the last skeleton through brief dropouts; clear once the hand is gone.
      if (!lm) {
        if (!frame.handDetected) ctx.clearRect(0, 0, w, h);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(196, 175, 252, 0.95)";
      for (const [a, b] of HAND_CONNECTIONS) {
        const p = lm[a];
        const q = lm[b];
        if (!p || !q) continue;
        ctx.beginPath();
        ctx.moveTo(p.x * w, p.y * h);
        ctx.lineTo(q.x * w, q.y * h);
        ctx.stroke();
      }
      lm.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, i === 8 ? 5 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 8 ? (frame.indexExtended ? "#8b5cf6" : "#f48fb9") : "#ffffff";
        ctx.fill();
      });
    });
  }, [subscribe]);

  const live = cameraStatus === "ready";
  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-2xl border-2 border-white bg-gradient-to-br from-plum-700 to-plum-900 shadow-soft",
        className,
      )}
    >
      {/* Mirrored so it behaves like a mirror; landmarks are mirrored with it. */}
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full -scale-x-100 object-cover" />
      <canvas ref={overlayRef} aria-hidden className="absolute inset-0 size-full -scale-x-100" />
      {live ? (
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white">
          <span className="size-1.5 animate-blink rounded-full bg-danger-400" /> Live
        </span>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/60">
          {cameraStatus === "requesting" ? "Starting camera…" : "Camera off"}
        </div>
      )}
    </div>
  );
}
