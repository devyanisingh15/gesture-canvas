"use client";

import { Sparkles } from "lucide-react";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { EvaluationPanel } from "@/components/game/EvaluationPanel";
import { Badge } from "@/components/ui/Badge";
import type { Stroke } from "@/features/game/types";

export function EvaluatingScreen({ strokes, onDone }: { strokes: Stroke[]; onDone?: () => void }) {
  return (
    <>
      <div className="text-center">
        <Badge tone="violet" uppercase>
          <Sparkles className="size-3" aria-hidden /> AI evaluation
        </Badge>
        <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700 sm:text-[40px]">Judging the masterpieces…</h1>
        <p className="mt-2 text-[15px] text-plum-500">Every drawing is scored on the same four things.</p>
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl items-center gap-8 md:grid-cols-2">
        <div className="relative rounded-[24px] border-2 border-white bg-cream-100 p-3 shadow-card">
          <DrawingCanvas strokes={strokes} label="Your drawing being scored" />
          <span aria-hidden className="absolute inset-x-5 h-1 animate-scan rounded-full bg-violet-400/70 shadow-[0_0_18px_4px_rgb(139_92_246/0.45)]" />
        </div>
        <EvaluationPanel onDone={onDone} />
      </div>
    </>
  );
}
