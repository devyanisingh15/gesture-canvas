"use client";

import { Eraser, Hand, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PromptArt } from "@/components/art/PromptArt";
import { CameraPreview } from "@/components/game/CameraPreview";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { GameTimer } from "@/components/game/GameTimer";
import { GestureIndicator } from "@/components/game/GestureIndicator";
import { PlayerCard } from "@/components/game/PlayerCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getPrompt } from "@/features/game/prompts";
import { PHASE_ROUTES } from "@/features/game/routes";
import type { Stroke } from "@/features/game/types";
import { useCountdown } from "@/hooks/useCountdown";
import { MOCK_ROOM, mockStrokes } from "@/mocks/game";

const MOCK_STROKE_MS = 2200;

export function DrawScreen() {
  const router = useRouter();
  const total = MOCK_ROOM.settings.drawSeconds;
  const prompt = getPrompt(MOCK_ROOM.targetPromptId);
  const remaining = useCountdown(total, { onEnd: () => router.push(PHASE_ROUTES.TIME_UP) });

  // Phase 1 stand-in for the finger tracker: replay a drawing one stroke at a time.
  const source = useMemo(() => mockStrokes(prompt.id, 7, 1.6), [prompt.id]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [next, setNext] = useState(0);

  useEffect(() => {
    if (next >= source.length) return;
    const id = window.setTimeout(() => {
      const stroke = source[next];
      if (stroke) setStrokes((s) => [...s, stroke]);
      setNext((n) => n + 1);
    }, MOCK_STROKE_MS);
    return () => window.clearTimeout(id);
  }, [next, source]);

  const last = strokes.at(-1)?.points.at(-1);
  const cursor = last ? { x: last.x, y: last.y } : { x: 0.5, y: 0.5 };
  const drawing = next < source.length;

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
            <GestureIndicator status={drawing ? "drawing" : "detected"} />
            <span className="hidden items-center gap-1.5 text-xs font-bold text-plum-400 sm:inline-flex">
              <Hand className="size-3.5" aria-hidden /> Index finger up to draw
            </span>
          </div>
          {/* Mouse and touch drawing are disabled during the round; the finger tracker is the only input. */}
          <div
            className="cursor-not-allowed touch-none select-none"
            title="Use your index finger to draw"
            onPointerDown={(e) => e.preventDefault()}
          >
            <DrawingCanvas strokes={strokes} cursor={cursor} label={`Your ${prompt.label} drawing`} className="aspect-[16/11]" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Undo2 className="size-4" aria-hidden />}
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              disabled={strokes.length === 0}
            >
              Undo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<Eraser className="size-4" aria-hidden />}
              onClick={() => {
                setStrokes([]);
                setNext(source.length);
              }}
              disabled={strokes.length === 0}
            >
              Clear
            </Button>
            <span className="ml-auto text-xs font-bold text-plum-400">{strokes.length} {strokes.length === 1 ? "stroke" : "strokes"}</span>
            <Button variant="ghost" size="sm" onClick={() => router.push(PHASE_ROUTES.TIME_UP)}>
              End round (preview)
            </Button>
          </div>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <CameraPreview />
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
          {MOCK_ROOM.players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              variant="row"
              trailing={<span className="text-[11px] font-bold text-violet-500">Drawing…</span>}
            />
          ))}
        </div>
      </aside>
    </div>
  );
}
