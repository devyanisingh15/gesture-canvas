"use client";

import { useEffect, useRef, useState } from "react";
import { StrokeRenderer, type CanvasSize } from "@/features/drawing/renderer";
import type { Stroke } from "@/features/game/types";
import { cn } from "@/lib/cn";

interface DrawingCanvasProps {
  strokes: readonly Stroke[];
  /** Stroke still being drawn; redrawn every frame while the rest stay cached. */
  activeStrokeId?: string | null;
  className?: string;
  label?: string;
  /** Dotted grid surface (true for live drawing, false for thumbnails). */
  grid?: boolean;
  /** Overlays that share the drawing area's coordinates, e.g. GestureCursor. */
  children?: React.ReactNode;
}

/**
 * Drawing surface. Strokes are vector data (normalized 0..1 points); this
 * component only renders them to a high-DPI <canvas> sized to its container.
 */
export function DrawingCanvas({ strokes, activeStrokeId = null, className, label = "Drawing canvas", grid = true, children }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<StrokeRenderer | null>(null);
  const [size, setSize] = useState<CanvasSize | null>(null);

  // Track the CSS size and device pixel ratio so the backing store stays sharp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height, dpr: window.devicePixelRatio || 1 };
      setSize((prev) =>
        prev && prev.width === next.width && prev.height === next.height && prev.dpr === next.dpr ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    // Zooming or moving to another display changes the pixel ratio without a resize.
    let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onDpr = () => {
      measure();
      dprQuery.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDpr);
    };
    dprQuery.addEventListener("change", onDpr);
    return () => {
      observer.disconnect();
      dprQuery.removeEventListener("change", onDpr);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || size.width === 0) return;
    rendererRef.current ??= new StrokeRenderer();
    rendererRef.current.render(canvas, strokes, activeStrokeId, size);
  }, [strokes, activeStrokeId, size]);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-[18px] border-2 border-violet-200",
        grid ? "bg-dot-grid" : "bg-cream-50",
        className,
      )}
    >
      {/* Square drawing area centered in the surface; stroke and cursor coordinates share it. */}
      <div className="absolute left-1/2 top-[6%] aspect-square h-[88%] -translate-x-1/2">
        <canvas ref={canvasRef} className="absolute inset-0 size-full" data-stroke-count={strokes.length} />
        {children}
      </div>
    </div>
  );
}

/** Violet fingertip dot with glow ring and hand pointer, as in the hero mock. x/y are 0..1 of its container. */
export function FingerCursor({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden
      className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-150"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    >
      <span className="flex size-8 animate-pulse-ring items-center justify-center rounded-full bg-violet-200/60">
        <span className="size-3 rounded-full bg-violet-500 ring-2 ring-white" />
      </span>
      <svg viewBox="0 0 24 24" className="absolute left-5 top-4 size-4 text-plum-700" aria-hidden>
        <path
          d="M9 11V5.5a1.5 1.5 0 013 0V10m0-1.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5a6 6 0 01-6 6h-1.2a5 5 0 01-4-2L4.5 15a1.5 1.5 0 012.3-1.9L9 15"
          fill="#fff"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
