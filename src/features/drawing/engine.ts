import type { Drawing, Point, Stroke } from "./types";

/** Points closer than this (fraction of the drawing area) to the previous one are skipped. */
export const MIN_POINT_DISTANCE = 0.004;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clampPoint = (p: Point): Point => ({ x: clamp01(p.x), y: clamp01(p.y), timestamp: p.timestamp });

/** "points": the stroke in progress grew. "strokes": a stroke started or ended, or the drawing was undone, cleared or loaded. */
export type DrawingChange = "points" | "strokes";

/** What DrawingCanvas needs to paint a drawing that changes every frame. */
export interface DrawingSource {
  /** Every stroke, the one in progress last. */
  readonly strokes: readonly Stroke[];
  readonly activeStroke: Stroke | null;
  subscribe(listener: (change: DrawingChange) => void): () => void;
}

/**
 * The drawing being made, outside React: strokes start, grow and end as the
 * finger moves, without a render per point. Finished strokes are never
 * changed again, so renderers can cache them. toDrawing() gives a plain,
 * serializable copy for saving and handing in.
 */
export class DrawingEngine implements DrawingSource {
  private finished: Stroke[] = [];
  private active: Stroke | null = null;
  private listeners = new Set<(change: DrawingChange) => void>();
  private version = 0;
  private copy: { version: number; drawing: Drawing } | null = null;

  constructor(initial?: Drawing | null) {
    if (initial) this.finished = initial.strokes.map((s) => ({ ...s, points: s.points.map(clampPoint) }));
  }

  get strokes(): readonly Stroke[] {
    return this.active ? [...this.finished, this.active] : this.finished;
  }

  get activeStroke(): Stroke | null {
    return this.active;
  }

  get isDrawing(): boolean {
    return this.active !== null;
  }

  /** Pen down. Ends any stroke still in progress first. */
  beginStroke(id: string, point: Point, style: { color?: string; width?: number } = {}): void {
    this.closeActive();
    this.active = { id, points: [clampPoint(point)], ...(style.color && { color: style.color }), ...(style.width && { width: style.width }) };
    this.changed("strokes");
  }

  /** Adds a point to the stroke in progress. False when the pen is up or the finger barely moved. */
  addPoint(point: Point): boolean {
    const stroke = this.active;
    if (!stroke) return false;
    const p = clampPoint(point);
    const prev = stroke.points[stroke.points.length - 1]!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_POINT_DISTANCE) return false;
    stroke.points.push(p);
    this.changed("points");
    return true;
  }

  /** Pen up. A stroke of a single point is a stray touch and is dropped. */
  endStroke(): void {
    if (this.closeActive()) this.changed("strokes");
  }

  /** Removes the last stroke, including one in progress. */
  undo(): void {
    if (this.active) this.active = null;
    else if (this.finished.length > 0) this.finished = this.finished.slice(0, -1); // never in place: renderers compare arrays
    else return;
    this.changed("strokes");
  }

  clear(): void {
    if (!this.active && this.finished.length === 0) return;
    this.active = null;
    this.finished = [];
    this.changed("strokes");
  }

  /** Replaces the drawing, e.g. with one restored after a reconnect. */
  load(drawing: Drawing): void {
    this.active = null;
    this.finished = drawing.strokes.map((s) => ({ ...s, points: s.points.map(clampPoint) }));
    this.changed("strokes");
  }

  /**
   * A plain copy of the drawing so far, safe to keep and serialize. Includes the
   * stroke in progress once it has two points. Cached until the next change.
   */
  toDrawing(): Drawing {
    if (this.copy?.version === this.version) return this.copy.drawing;
    const strokes = this.active && this.active.points.length > 1 ? [...this.finished, { ...this.active, points: this.active.points.slice() }] : this.finished;
    const drawing = { strokes: strokes.slice() };
    this.copy = { version: this.version, drawing };
    return drawing;
  }

  subscribe(listener: (change: DrawingChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private closeActive(): boolean {
    const stroke = this.active;
    if (!stroke) return false;
    this.active = null;
    if (stroke.points.length > 1) this.finished = [...this.finished, stroke];
    return true;
  }

  private changed(change: DrawingChange): void {
    this.version++;
    this.listeners.forEach((fn) => fn(change));
  }
}
