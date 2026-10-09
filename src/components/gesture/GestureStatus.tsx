import { GestureIndicator } from "@/components/game/GestureIndicator";
import type { GestureStatus as Status } from "@/features/game/types";
import type { TrackerStatus } from "@/features/gesture/types";

interface GestureStatusProps {
  trackerStatus: TrackerStatus;
  handDetected: boolean;
  indexExtended: boolean;
  className?: string;
}

export function gestureStatusOf({ trackerStatus, handDetected, indexExtended }: Omit<GestureStatusProps, "className">): Status {
  if (trackerStatus !== "running") return trackerStatus === "error" ? "not-detected" : "starting";
  if (!handDetected) return "not-detected";
  return indexExtended ? "drawing" : "detected";
}

/** "Hand detected" / "Hand not detected" chip driven by live tracking state. */
export function GestureStatus({ className, ...state }: GestureStatusProps) {
  return <GestureIndicator status={gestureStatusOf(state)} className={className} />;
}
