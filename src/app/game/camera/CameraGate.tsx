"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CameraPermissionModal, type CameraPermissionState } from "@/components/game/CameraPermissionModal";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { PHASE_ROUTES } from "@/features/game/routes";

/**
 * Phase 1 mock of the permission flow. Phase 2 calls getUserMedia here and
 * maps NotAllowedError to the "denied" state.
 */
export function CameraGate() {
  const router = useRouter();
  const [state, setState] = useState<CameraPermissionState>("prompt");

  return (
    <>
      <div aria-hidden className="pointer-events-none mx-auto max-w-3xl opacity-60 blur-[2px]">
        <DrawingCanvas strokes={[]} />
      </div>
      <CameraPermissionModal
        open
        state={state}
        onAllow={() => {
          setState("requesting");
          window.setTimeout(() => router.push(PHASE_ROUTES.DRAWING), 1200);
        }}
        onSkip={() => (state === "denied" ? router.push("/") : setState("denied"))}
      />
    </>
  );
}
