import { Camera, CameraOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export type CameraPermissionState = "prompt" | "requesting" | "denied" | "error";

interface CameraPermissionModalProps {
  open: boolean;
  state: CameraPermissionState;
  /** Shown for the "error" state (no camera, camera busy…). */
  errorMessage?: string;
  onAllow?: () => void;
  onSkip?: () => void;
}

/** Asks for webcam access before drawing; shows recovery steps when it's blocked. */
export function CameraPermissionModal({ open, state, errorMessage, onAllow, onSkip }: CameraPermissionModalProps) {
  const denied = state === "denied" || state === "error";
  return (
    <Modal open={open} labelledBy="camera-title" className="text-center">
      <span
        className={
          denied
            ? "mx-auto flex size-16 items-center justify-center rounded-2xl bg-danger-100 text-danger-500"
            : "mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-400 to-violet-600 text-white shadow-clay-violet"
        }
      >
        {denied ? <CameraOff className="size-8" aria-hidden /> : <Camera className="size-8" aria-hidden />}
      </span>
      <h2 id="camera-title" className="mt-5 text-[26px] font-semibold leading-tight text-plum-700">
        {state === "error" ? "Camera unavailable" : denied ? "Camera is blocked" : "Allow camera access"}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-plum-500">
        {state === "error"
          ? `${errorMessage ?? "The camera couldn't start."} Check that a camera is connected and not used by another app, then try again.`
          : denied
          ? "Gesture Canvas needs your camera to track your index finger. Click the camera icon in your browser's address bar, choose Allow, then try again."
          : "Your hand is the controller. We use your camera to follow your index finger while you draw."}
      </p>
      {!denied && (
        <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-mint-50 px-3 py-1.5 text-xs font-bold text-mint-700">
          <ShieldCheck className="size-4" aria-hidden /> Video never leaves your device
        </p>
      )}
      <div className="mt-7 flex flex-col gap-2.5">
        <Button size="lg" fullWidth onClick={onAllow} disabled={state === "requesting"}>
          {denied ? "Try again" : state === "requesting" ? "Waiting for permission…" : "Allow camera"}
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onSkip}>
          {denied ? "Leave game" : "Not now"}
        </Button>
      </div>
    </Modal>
  );
}
