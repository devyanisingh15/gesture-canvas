import type { Stroke } from "@/features/game/types";
import { cn } from "@/lib/cn";

interface DrawingCanvasProps {
  strokes: Stroke[];
  /** Finger cursor position, normalized 0..1. */
  cursor?: { x: number; y: number } | null;
  className?: string;
  label?: string;
  /** Dotted grid surface (true for live drawing, false for thumbnails). */
  grid?: boolean;
}

function strokePath(stroke: Stroke): string {
  const pts = stroke.points;
  if (pts.length === 0) return "";
  const [first, ...rest] = pts;
  if (!first) return "";
  let d = `M${first.x * 100} ${first.y * 100}`;
  // Quadratic smoothing through midpoints for a hand-drawn line.
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i]!;
    const next = rest[i + 1];
    if (next) {
      d += ` Q${p.x * 100} ${p.y * 100} ${((p.x + next.x) / 2) * 100} ${((p.y + next.y) / 2) * 100}`;
    } else {
      d += ` L${p.x * 100} ${p.y * 100}`;
    }
  }
  return d;
}

/**
 * Drawing surface. Phase 1 renders stroke data as SVG; Phase 3 swaps the
 * internals for a DPR-aware <canvas> fed by the finger tracker, keeping
 * this component's props.
 */
export function DrawingCanvas({ strokes, cursor, className, label = "Drawing canvas", grid = true }: DrawingCanvasProps) {
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
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        {strokes.map((s) => (
          <path
            key={s.id}
            d={strokePath(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {cursor && <FingerCursor x={cursor.x} y={cursor.y} />}
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
