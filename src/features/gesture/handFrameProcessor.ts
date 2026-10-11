import { landmarkToCanvasPoint } from "./coordinates";
import { isIndexFingerExtended, LANDMARK } from "./landmarks";
import { PointFilter } from "./oneEuroFilter";
import type { HandFrame, HandLandmark } from "./types";

/** One hand found in a camera frame. */
export interface HandDetection {
  landmarks: HandLandmark[];
  /** The model's confidence in this hand, 0..1. */
  score: number;
}

export const HAND_FRAME_TUNING = {
  /** Consecutive empty frames before the hand counts as gone: the pen lifts and the UI says "Hand not detected". */
  lostFrames: 4,
  /** Consecutive frames a pose must hold before the draw state flips, to avoid flicker. */
  gestureFrames: 2,
  /** Below this confidence a frame can't draw: the pen lifts until tracking is sure again. */
  minDrawConfidence: 0.6,
  /** How far (fraction of the frame) the fingertip may be estimated outside the camera image and still draw. */
  edgeSlack: 0.02,
} as const;

const EMPTY: Omit<HandFrame, "timestamp"> = { handDetected: false, indexExtended: false, indexTip: null, landmarks: null, confidence: null };

/**
 * Turns per-frame detections into what the game uses: is a hand there, is it
 * making the draw gesture, and where is the (smoothed) index fingertip on the
 * canvas. Pure apart from its own state, so it is tested without a camera.
 *
 * The pen is down only while the index finger is extended AND tracking is
 * confident AND the fingertip is inside the camera image. A hand that
 * disappears holds its last state for a few frames (dropouts are normal),
 * then counts as gone.
 */
export class HandFrameProcessor {
  private filter = new PointFilter();
  private missing: number = HAND_FRAME_TUNING.lostFrames;
  private poseFrames = 0;
  private drawPose = false;
  private last: HandFrame | null = null;

  next(detection: HandDetection | null, now: number): HandFrame {
    const t = HAND_FRAME_TUNING;
    if (!detection) {
      this.missing = Math.min(this.missing + 1, t.lostFrames);
      if (this.missing >= t.lostFrames || !this.last?.handDetected) return this.lose(now);
      // Brief dropout: keep the stroke going where it was.
      return (this.last = { ...this.last, timestamp: now, landmarks: null });
    }

    this.missing = 0;
    const tip = detection.landmarks[LANDMARK.INDEX_TIP];
    if (!tip) return this.lose(now);
    const inFrame = [tip.x, tip.y].every((v) => v >= -t.edgeSlack && v <= 1 + t.edgeSlack);
    const confident = detection.score >= t.minDrawConfidence && inFrame;
    const extended = confident && isIndexFingerExtended(detection.landmarks);

    if (!confident) {
      // Unsure where the finger is: lift the pen now rather than draw a wild line.
      this.drawPose = false;
      this.poseFrames = 0;
    } else {
      this.poseFrames = extended === this.drawPose ? 0 : this.poseFrames + 1;
      if (this.poseFrames >= t.gestureFrames) {
        this.drawPose = extended;
        this.poseFrames = 0;
      }
    }
    const indexTip = this.filter.filter(landmarkToCanvasPoint(tip), now);
    return (this.last = {
      timestamp: now,
      handDetected: true,
      indexExtended: this.drawPose,
      indexTip,
      landmarks: detection.landmarks,
      confidence: detection.score,
    });
  }

  reset(): void {
    this.filter.reset();
    this.missing = HAND_FRAME_TUNING.lostFrames;
    this.poseFrames = 0;
    this.drawPose = false;
    this.last = null;
  }

  private lose(now: number): HandFrame {
    // Hand is gone: pen up, cursor hidden, smoothing restarts on return.
    this.reset();
    return { timestamp: now, ...EMPTY };
  }
}

/** The frame sent when tracking stops, so every listener lifts the pen and hides its cursor. */
export const noHandFrame = (now: number): HandFrame => ({ timestamp: now, ...EMPTY });
