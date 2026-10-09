import { AlarmClock } from "lucide-react";
import { DrawingCanvas } from "@/components/game/DrawingCanvas";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Stroke } from "@/features/game/types";

interface TimesUpScreenProps {
  strokes: Stroke[];
  submitted: number;
  total: number;
}

export function TimesUpScreen({ strokes, submitted, total }: TimesUpScreenProps) {
  return (
    <>
      <span className="flex size-20 animate-wiggle items-center justify-center rounded-3xl bg-gradient-to-b from-pink-300 to-pink-500 text-white shadow-clay-pink">
        <AlarmClock className="size-10" aria-hidden />
      </span>
      <h1 className="text-outlined mt-6 animate-pop font-display text-[64px] font-bold uppercase leading-none tracking-[-0.02em] text-pink-400 sm:text-[80px]">
        Time&apos;s up!
      </h1>
      <p className="mt-3 font-display text-xl font-semibold text-plum-500">Pens down. Hands down.</p>
      <div className="mt-8 w-full max-w-sm rotate-[-1.5deg] rounded-[24px] border-2 border-white bg-cream-100 p-3 shadow-card">
        <DrawingCanvas strokes={strokes} label="Your final drawing" />
      </div>
      <div className="mt-8 w-full max-w-xs">
        <div className="mb-2 flex justify-between text-xs font-bold text-plum-500">
          <span>Collecting drawings</span>
          <span>
            {submitted}/{total}
          </span>
        </div>
        <ProgressBar value={total > 0 ? (submitted / total) * 100 : 0} tone="pink" label="Drawings collected" />
      </div>
    </>
  );
}
