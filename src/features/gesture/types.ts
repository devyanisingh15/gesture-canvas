/** A MediaPipe landmark, normalized to the video frame (0..1, origin top-left, not mirrored). */
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

/** Normalized 0..1 point in drawing-canvas space (already mirrored). */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** One processed camera frame. */
export interface HandFrame {
  timestamp: number;
  handDetected: boolean;
  /** True when the index finger is extended: the MVP "draw" gesture. */
  indexExtended: boolean;
  /** Smoothed index fingertip in canvas space, or null when no hand. */
  indexTip: CanvasPoint | null;
  /** Raw landmarks for the preview overlay (21 points), or null when no hand. */
  landmarks: HandLandmark[] | null;
}

export type TrackerStatus = "idle" | "loading" | "running" | "error";
