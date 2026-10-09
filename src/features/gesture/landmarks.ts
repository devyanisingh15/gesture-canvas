import type { HandLandmark } from "./types";

/** MediaPipe hand landmark indices. */
export const LANDMARK = {
  WRIST: 0,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
} as const;

/** Bones drawn in the camera preview overlay. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

function dist(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * A finger counts as extended when its tip is clearly farther from the wrist
 * than its middle (PIP) joint, and the finger is roughly straight. This is
 * rotation-independent, so it works whichever way the hand points.
 */
export function isFingerExtended(landmarks: HandLandmark[], mcp: number, pip: number, tip: number): boolean {
  const wrist = landmarks[LANDMARK.WRIST];
  const m = landmarks[mcp];
  const p = landmarks[pip];
  const t = landmarks[tip];
  if (!wrist || !m || !p || !t) return false;
  const reachesOut = dist(wrist, t) > dist(wrist, p) * 1.12;
  // Straightness: MCP→tip is almost as long as MCP→PIP→tip.
  const straight = dist(m, t) > (dist(m, p) + dist(p, t)) * 0.85;
  return reachesOut && straight;
}

/**
 * MVP draw gesture: index finger extended. The middle finger must be curled so
 * an open palm doesn't draw; ring and pinky are ignored to stay forgiving.
 */
export function isIndexFingerExtended(landmarks: HandLandmark[]): boolean {
  const index = isFingerExtended(landmarks, LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP, LANDMARK.INDEX_TIP);
  const middle = isFingerExtended(landmarks, LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_TIP);
  return index && !middle;
}
