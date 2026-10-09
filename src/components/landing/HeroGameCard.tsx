import { Hand } from "lucide-react";
import { PromptArt } from "@/components/art/PromptArt";
import { Star } from "@/components/art/Decorations";
import { AccuracyBadge } from "@/components/game/AccuracyBadge";
import { FingerCursor } from "@/components/game/DrawingCanvas";
import { GestureIndicator } from "@/components/game/GestureIndicator";

/** Tilted live-game mockup on the right of the hero. */
export function HeroGameCard() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] py-10 lg:mr-0">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 aspect-square w-[118%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-violet-300/60"
      />
      <Star className="absolute -left-3 bottom-[22%] size-7 animate-float" />
      <span aria-hidden className="absolute -right-1 top-[13%] size-2 rounded-full bg-orange-300" />

      <div className="relative rotate-[-1.5deg] rounded-[28px] border-2 border-white bg-cream-100 p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <GestureIndicator status="detected" />
          <span className="font-display text-lg font-bold tabular-nums text-plum-700">00:18</span>
        </div>
        <div className="bg-dot-grid relative aspect-[4/3] overflow-hidden rounded-[18px] border-2 border-violet-200">
          <PromptArt promptId="rocket" className="absolute inset-[6%] size-[88%]" strokeWidth={4} />
          <FingerCursor x={0.79} y={0.43} />
        </div>
        <AccuracyBadge value={94} className="absolute -bottom-1 right-6 sm:right-8" />
      </div>

      <div className="relative mx-3 -mt-1 flex items-center gap-2 rounded-b-2xl border-2 border-t-0 border-white bg-cream-50 px-3 py-2.5 shadow-soft sm:mx-5">
        <span className="flex size-9 items-center justify-center rounded-xl border border-violet-200 bg-violet-100 text-plum-600">
          <Hand className="size-4" aria-hidden />
        </span>
        <span className="h-px flex-1 bg-violet-300" />
        <span className="size-8 rounded-full border-2 border-violet-400 bg-violet-100" />
        <span className="h-px flex-1 bg-violet-300" />
        <span className="flex size-9 items-center justify-center rounded-xl border border-violet-200 bg-violet-100">
          <PromptArt promptId="rocket" className="size-5" strokeWidth={2} />
        </span>
        <span className="h-px flex-1 bg-violet-300" />
        <span className="font-display text-sm font-bold text-mint-600">94%</span>
      </div>
    </div>
  );
}
