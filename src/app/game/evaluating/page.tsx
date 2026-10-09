"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { EvaluationPanel } from "@/components/game/EvaluationPanel";
import { ScreenContainer } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROUND_RESULTS } from "@/mocks/game";

export default function EvaluatingPage() {
  const router = useRouter();
  const yours = MOCK_ROUND_RESULTS[0]!;
  return (
    <ScreenContainer>
      <div className="text-center">
        <Badge tone="violet" uppercase>
          <Sparkles className="size-3" aria-hidden /> AI evaluation
        </Badge>
        <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700 sm:text-[40px]">Judging the masterpieces…</h1>
        <p className="mt-2 text-[15px] text-plum-500">Every drawing is scored on the same four things.</p>
      </div>
      <div className="mx-auto mt-10 grid max-w-4xl items-center gap-8 md:grid-cols-2">
        <div className="relative rounded-[24px] border-2 border-white bg-cream-100 p-3 shadow-card">
          <DrawingCanvas strokes={yours.strokes} label="Your drawing being scored" />
          <span aria-hidden className="absolute inset-x-5 h-1 animate-scan rounded-full bg-violet-400/70 shadow-[0_0_18px_4px_rgb(139_92_246/0.45)]" />
        </div>
        <EvaluationPanel onDone={() => router.push(PHASE_ROUTES.ROUND_RESULTS)} />
      </div>
    </ScreenContainer>
  );
}
