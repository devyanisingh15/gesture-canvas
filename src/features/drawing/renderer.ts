import { DEFAULT_STROKE_COLOR, DEFAULT_STROKE_WIDTH, STROKE_WIDTH_REFERENCE, type Stroke } from "./types";

export interface CanvasSize {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio the backing store was sized for. */
  dpr: number;
}

/** Line width in CSS px for a stroke on a canvas of the given CSS width. */
export function strokeWidthPx(stroke: Stroke, canvasWidth: number): number {
  return Math.max(1.5, ((stroke.width ?? DEFAULT_STROKE_WIDTH) * canvasWidth) / STROKE_WIDTH_REFERENCE);
}

/**
 * Draws one stroke as a smooth curve: quadratic segments through the midpoints
 * of consecutive points, so corners are rounded without overshooting.
 * Expects the context to be scaled to CSS pixels.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, size: Pick<CanvasSize, "width" | "height">): void {
  const pts = stroke.points;
  const first = pts[0];
  if (!first) return;
  const w = size.width;
  const h = size.height;
  const lineWidth = strokeWidthPx(stroke, w);
  ctx.strokeStyle = stroke.color ?? DEFAULT_STROKE_COLOR;
  ctx.fillStyle = stroke.color ?? DEFAULT_STROKE_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (pts.length === 1) {
    // A stroke that has just started: show a dot under the finger.
    ctx.beginPath();
    ctx.arc(first.x * w, first.y * h, lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(first.x * w, first.y * h);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const next = pts[i + 1]!;
    ctx.quadraticCurveTo(p.x * w, p.y * h, ((p.x + next.x) / 2) * w, ((p.y + next.y) / 2) * h);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last.x * w, last.y * h);
  ctx.stroke();
}

/** Sizes a canvas's backing store for its CSS size and device pixel ratio. Returns true if it changed. */
export function fitCanvas(canvas: HTMLCanvasElement, size: CanvasSize): boolean {
  const pw = Math.max(1, Math.round(size.width * size.dpr));
  const ph = Math.max(1, Math.round(size.height * size.dpr));
  if (canvas.width === pw && canvas.height === ph) return false;
  canvas.width = pw;
  canvas.height = ph;
  return true;
}

/**
 * Renders strokes to a canvas. Finished strokes are cached on an offscreen
 * layer, so each camera frame only redraws the stroke in progress.
 */
export class StrokeRenderer {
  private cache: HTMLCanvasElement | null = null;
  private cachedStrokes: readonly Stroke[] = [];
  private cachedKey = "";

  render(canvas: HTMLCanvasElement, strokes: readonly Stroke[], activeStrokeId: string | null, size: CanvasSize): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    fitCanvas(canvas, size);

    const active = activeStrokeId ? strokes.find((s) => s.id === activeStrokeId) : undefined;
    const finished = active ? strokes.filter((s) => s !== active) : strokes;
    const layer = this.finishedLayer(finished, size);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (layer) ctx.drawImage(layer, 0, 0);
    if (active) {
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      drawStroke(ctx, active, size);
    }
  }

  private finishedLayer(strokes: readonly Stroke[], size: CanvasSize): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const key = `${size.width}x${size.height}@${size.dpr}`;
    const same =
      this.cache &&
      key === this.cachedKey &&
      strokes.length === this.cachedStrokes.length &&
      strokes.every((s, i) => s === this.cachedStrokes[i]);
    if (same) return this.cache;

    this.cache ??= document.createElement("canvas");
    fitCanvas(this.cache, size);
    const ctx = this.cache.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cache.width, this.cache.height);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    for (const s of strokes) drawStroke(ctx, s, size);
    this.cachedStrokes = strokes;
    this.cachedKey = key;
    return this.cache;
  }
}
