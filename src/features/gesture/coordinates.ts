import type { CanvasPoint, HandLandmark } from "./types";

/**
 * Fraction of the camera frame trimmed from each edge. Players can't comfortably
 * reach the very edge of the frame, so the inner region maps to the full canvas.
 */
export const DEFAULT_FRAME_MARGIN = 0.12;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Converts a normalized MediaPipe landmark (video space) into a normalized
 * canvas point. The camera is a selfie view, so x is mirrored: moving your
 * hand right moves the cursor right.
 */
export function landmarkToCanvasPoint(
  landmark: Pick<HandLandmark, "x" | "y">,
  { mirror = true, margin = DEFAULT_FRAME_MARGIN }: { mirror?: boolean; margin?: number } = {},
): CanvasPoint {
  const x = mirror ? 1 - landmark.x : landmark.x;
  const span = 1 - margin * 2;
  return { x: clamp01((x - margin) / span), y: clamp01((landmark.y - margin) / span) };
}

/** Converts a normalized canvas point to pixel coordinates for a canvas of the given size. */
export function canvasPointToPixels(point: CanvasPoint, size: { width: number; height: number }): { x: number; y: number } {
  return { x: point.x * size.width, y: point.y * size.height };
}
