"use client";

import { Eraser, Hand, RefreshCw, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PromptArt } from "@/components/art/PromptArt";
import { CameraPermissionModal } from "@/components/game/CameraPermissionModal";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { GameTimer } from "@/components/game/GameTimer";
import { PlayerCard } from "@/components/game/PlayerCard";
import { CameraPreview } from "@/components/gesture/CameraPreview";
import { GestureCursor } from "@/components/gesture/GestureCursor";
import { GestureStatus } from "@/components/gesture/GestureStatus";
import { HandTrackingDebug, useHandDebug } from "@/components/gesture/HandTrackingDebug";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Drawing } from "@/features/drawing/types";
import type { DrawingPrompt, PlayerView } from "@/features/game/types";
import { useCountdown } from "@/hooks/useCountdown";
import { useGestureDrawing } from "@/hooks/useGestureDrawing";
import { useHandInput } from "@/hooks/useHandInput";

interface DrawScreenProps {
  prompt: DrawingPrompt;
  /** Round length in seconds. */
  total: number;
  /** Seconds left, from the server clock. Leave out to run a local clock that starts once tracking runs (preview). */
  remaining?: number;
  players: PlayerView[];
  /** Ids of players who have handed in their drawing. */
  submittedIds?: readonly string[];
  /** A saved drawing to continue (after a refresh mid-round). */
  initialDrawing?: Drawing | null;
  /** Called with the drawing whenever it changes, so the game can submit it. */
  onDrawingChange?: (drawing: Drawing) => void;
  /** Local clock ran out (preview only). */
  onTimeUp?: () => void;
  /** Host-only early finish; hidden when not given. */
  onEndRound?: () => void;
  endRoundLabel?: string;
  /** Where "Not now" on the camera prompt goes. */
  onSkipCamera?: () => void;
}

export function DrawScreen({
  prompt,
  total,
  remaining: serverRemaining,
  players,
  submittedIds = [],
  initialDrawing,
  onDrawingChange,
  onTimeUp,
  onEndRound,
  endRoundLabel = "End round",
  onSkipCamera,
}: DrawScreenProps) {
  const router = useRouter();
  // Camera permission, the stream, hand tracking and cleanup; asks for the camera only if not yet allowed.
  const hand = useHandInput();
  const { camera, tracking } = hand;
  const debug = useHandDebug();
  const localRemaining = useCountdown(total, {
    running: serverRemaining === undefined && tracking.status === "running",
    onEnd: onTimeUp,
  });
  const remaining = serverRemaining ?? localRemaining;
  // Input stops the moment the countdown reaches zero.
  const drawing = useGestureDrawing(tracking, { enabled: tracking.status === "running" && remaining > 0, initial: initialDrawing });

  const { drawing: current } = drawing;
  useEffect(() => {
    onDrawingChange?.(current);
    // Only the drawing changing should report it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const modalState =
    camera.status === "error"
      ? camera.error?.kind === "denied"
        ? "denied"
        : "error"
      : camera.status === "requesting"
        ? "requesting"
        : "prompt";
  const showModal = camera.status === "error" || (hand.needsPermission && camera.status !== "ready");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl border-2 border-white bg-gradient-to-b from-sun-100 to-sun-200 shadow-soft">
              <PromptArt promptId={prompt.id} className="size-8" strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-plum-400">Draw a</p>
              <h1 className="text-[28px] font-semibold leading-none text-plum-700">{prompt.label}</h1>
            </div>
          </div>
          <GameTimer remaining={remaining} total={total} />
        </div>

        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <GestureStatus
              trackerStatus={tracking.status}
              handDetected={tracking.handDetected}
              indexExtended={tracking.indexExtended}
            />
            <span className="hidden items-center gap-1.5 text-xs font-bold text-plum-400 sm:inline-flex">
              <Hand className="size-3.5" aria-hidden /> Index finger up to draw
            </span>
          </div>
          {tracking.status === "error" && (
            <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-danger-100 px-4 py-2.5 text-sm font-bold text-danger-500">
              {tracking.error ?? "Hand tracking couldn't start."}
              <Button variant="secondary" size="sm" onClick={tracking.retry} iconLeft={<RefreshCw className="size-4" aria-hidden />}>
                Retry
              </Button>
            </div>
          )}
          {/* Mouse and touch drawing are disabled during the round; the finger tracker is the only input. */}
          <div
            className="cursor-not-allowed touch-none select-none"
            title="Use your index finger to draw"
            onPointerDown={(e) => e.preventDefault()}
          >
            <DrawingCanvas
              strokes={drawing.strokes}
              activeStrokeId={drawing.activeStrokeId}
              live={drawing.live}
              label={`Your ${prompt.label} drawing`}
              className="aspect-[16/11]"
            >
              <GestureCursor subscribe={tracking.subscribe} />
              {debug && <HandTrackingDebug subscribe={tracking.subscribe} />}
            </DrawingCanvas>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Undo2 className="size-4" aria-hidden />}
              onClick={drawing.undo}
              disabled={drawing.strokes.length === 0}
            >
              Undo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Eraser className="size-4" aria-hidden />}
              onClick={drawing.clear}
              disabled={drawing.strokes.length === 0}
            >
              Clear
            </Button>
            <span className="ml-auto text-xs font-bold text-plum-400" data-testid="stroke-count">
              {drawing.strokes.length} {drawing.strokes.length === 1 ? "stroke" : "strokes"}
            </span>
            {onEndRound && (
              <Button variant="ghost" size="sm" onClick={onEndRound}>
                {endRoundLabel}
              </Button>
            )}
          </div>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <CameraPreview videoRef={camera.attachVideo} cameraStatus={camera.status} subscribe={tracking.subscribe} />
        <Card className="p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-plum-400">Gestures</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm font-semibold text-plum-600">
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-violet-100 text-base">☝️</span>
              Index finger up: draw
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-pink-100 text-base">✋</span>
              Hand out of frame: pen up
            </li>
          </ul>
        </Card>
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-plum-400">Players</h2>
          {players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              variant="row"
              trailing={
                submittedIds.includes(p.id) ? (
                  <span className="text-[11px] font-bold text-mint-600">Done</span>
                ) : (
                  <span className="text-[11px] font-bold text-violet-500">Drawing…</span>
                )
              }
            />
          ))}
        </div>
      </aside>

      <CameraPermissionModal
        open={showModal}
        state={modalState}
        errorMessage={camera.error?.message}
        onAllow={() => void hand.start()}
        onSkip={onSkipCamera ?? (() => router.push("/"))}
      />
    </div>
  );
}
