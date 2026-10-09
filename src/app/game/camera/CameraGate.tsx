"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CameraPermissionModal, type CameraPermissionState } from "@/components/game/CameraPermissionModal";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { PHASE_ROUTES } from "@/features/game/routes";
import { requestCameraStream, stopCameraStream, toCameraError } from "@/services/camera";

/**
 * Pre-round permission check: asks for the camera, releases it right away,
 * and sends the player to the drawing screen, which reopens it.
 */
export function CameraGate() {
  const router = useRouter();
  const [state, setState] = useState<CameraPermissionState>("prompt");
  const [message, setMessage] = useState<string>();

  const allow = async () => {
    setState("requesting");
    try {
      stopCameraStream(await requestCameraStream());
      router.push(PHASE_ROUTES.DRAWING);
    } catch (err) {
      const error = toCameraError(err);
      setMessage(error.message);
      setState(error.kind === "denied" ? "denied" : "error");
    }
  };

  return (
    <>
      <div aria-hidden className="pointer-events-none mx-auto max-w-3xl opacity-60 blur-[2px]">
        <DrawingCanvas strokes={[]} />
      </div>
      <CameraPermissionModal
        open
        state={state}
        errorMessage={message}
        onAllow={() => void allow()}
        onSkip={() => router.push("/")}
      />
    </>
  );
}
