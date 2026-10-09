/**
 * MediaPipe hand tracking. Loads the HandLandmarker task (the maintained
 * successor of MediaPipe Hands) and turns video frames into landmarks.
 * The WASM runtime and model are served from /public so the game doesn't
 * depend on a third-party CDN.
 */
import type { HandLandmarker as HandLandmarkerType } from "@mediapipe/tasks-vision";
import type { HandLandmark } from "@/features/gesture/types";

export const HAND_TRACKING_CONFIG = {
  wasmPath: process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_PATH ?? "/mediapipe/wasm",
  modelPath: process.env.NEXT_PUBLIC_HAND_MODEL_PATH ?? "/models/hand_landmarker.task",
  numHands: 1,
  minHandDetectionConfidence: 0.6,
  minHandPresenceConfidence: 0.6,
  minTrackingConfidence: 0.5,
} as const;

export interface HandTracker {
  /** Returns the first detected hand's 21 landmarks, or null when no hand is in frame. */
  detect(video: HTMLVideoElement, timestampMs: number): HandLandmark[] | null;
  close(): void;
}

async function createLandmarker(delegate: "GPU" | "CPU"): Promise<HandLandmarkerType> {
  // Imported lazily so the ~1MB bundle only loads on screens that use the camera.
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(HAND_TRACKING_CONFIG.wasmPath);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_TRACKING_CONFIG.modelPath, delegate },
    runningMode: "VIDEO",
    numHands: HAND_TRACKING_CONFIG.numHands,
    minHandDetectionConfidence: HAND_TRACKING_CONFIG.minHandDetectionConfidence,
    minHandPresenceConfidence: HAND_TRACKING_CONFIG.minHandPresenceConfidence,
    minTrackingConfidence: HAND_TRACKING_CONFIG.minTrackingConfidence,
  });
}

export async function createHandTracker(): Promise<HandTracker> {
  let landmarker: HandLandmarkerType;
  try {
    landmarker = await createLandmarker("GPU");
  } catch {
    // Some devices (and headless browsers) have no usable WebGL; fall back to CPU.
    landmarker = await createLandmarker("CPU");
  }
  let lastTimestamp = -1;
  return {
    detect(video, timestampMs) {
      // detectForVideo requires strictly increasing timestamps.
      const ts = timestampMs <= lastTimestamp ? lastTimestamp + 1 : timestampMs;
      lastTimestamp = ts;
      const result = landmarker.detectForVideo(video, ts);
      const hand = result.landmarks[0];
      return hand && hand.length === 21 ? hand.map(({ x, y, z }) => ({ x, y, z })) : null;
    },
    close() {
      landmarker.close();
    },
  };
}
