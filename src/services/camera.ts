/** Webcam access. Kept separate from hand tracking and drawing. */

export type CameraErrorKind = "denied" | "not-found" | "in-use" | "unsupported" | "unknown";

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CameraError";
  }
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
};

export async function requestCameraStream(constraints: MediaStreamConstraints = DEFAULT_CONSTRAINTS): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("unsupported", "This browser can't access a camera. Use a recent Chrome, Edge, Safari or Firefox over HTTPS.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw toCameraError(err);
  }
}

export function toCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new CameraError("denied", "Camera access was blocked.");
    case "NotFoundError":
    case "OverconstrainedError":
      return new CameraError("not-found", "No camera was found.");
    case "NotSupportedError":
      return new CameraError("unsupported", "This browser can't access a camera.");
    case "NotReadableError":
    case "AbortError":
      return new CameraError("in-use", "The camera is being used by another app.");
    default:
      return new CameraError("unknown", err instanceof Error ? err.message : "The camera couldn't start.");
  }
}

export function stopCameraStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Current permission state where the Permissions API supports "camera" (not all browsers do). */
export async function queryCameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}
