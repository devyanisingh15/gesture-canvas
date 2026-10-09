"use client";

import { AlarmClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { ScreenContainer } from "@/components/layout/AppShell";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROOM, MOCK_ROUND_RESULTS } from "@/mocks/game";

export default function TimesUpPage() {
  const router = useRouter();
  const yours = MOCK_ROUND_RESULTS[0]!;
  const submitted = MOCK_ROOM.players.length - 1;

  useEffect(() => {
    const id = window.setTimeout(() => router.push(PHASE_ROUTES.EVALUATING), 3000);
    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <ScreenContainer className="flex flex-col items-center py-14 text-center">
      <span className="flex size-20 animate-wiggle items-center justify-center rounded-3xl bg-gradient-to-b from-pink-300 to-pink-500 text-white shadow-clay-pink">
        <AlarmClock className="size-10" aria-hidden />
      </span>
      <h1 className="text-outlined mt-6 animate-pop font-display text-[64px] font-bold uppercase leading-none tracking-[-0.02em] text-pink-400 sm:text-[80px]">
        Time&apos;s up!
      </h1>
      <p className="mt-3 font-display text-xl font-semibold text-plum-500">Pens down. Hands down.</p>
      <div className="mt-8 w-full max-w-sm rotate-[-1.5deg] rounded-[24px] border-2 border-white bg-cream-100 p-3 shadow-card">
        <DrawingCanvas strokes={yours.strokes} label="Your final drawing" />
      </div>
      <div className="mt-8 w-full max-w-xs">
        <div className="mb-2 flex justify-between text-xs font-bold text-plum-500">
          <span>Collecting drawings</span>
          <span>
            {submitted}/{MOCK_ROOM.players.length}
          </span>
        </div>
        <ProgressBar value={(submitted / MOCK_ROOM.players.length) * 100} tone="pink" label="Drawings collected" />
      </div>
    </ScreenContainer>
  );
}
