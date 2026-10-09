import { PromptArt } from "@/components/art/PromptArt";
import { Sparkle, Star } from "@/components/art/Decorations";
import { Badge } from "@/components/ui/Badge";
import type { DrawingPrompt } from "@/features/game/types";

interface TargetRevealProps {
  prompt: DrawingPrompt;
  startsIn: number;
}

/** "Your target is…" card shown to every player before drawing starts. */
export function TargetReveal({ prompt, startsIn }: TargetRevealProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center text-center">
      <Badge tone="pink" uppercase>
        Everyone draws the same thing
      </Badge>
      <p className="mt-6 font-display text-xl font-semibold text-plum-500">Your target is…</p>
      <div className="relative mt-5 animate-pop">
        <Star className="absolute -left-8 top-6 size-8 animate-float" />
        <Sparkle className="absolute -right-6 -top-4 size-6 text-sun-400" />
        <Sparkle className="absolute -right-10 bottom-10 size-4 text-violet-300" />
        <div className="flex size-64 items-center justify-center rounded-[32px] border-4 border-white bg-gradient-to-b from-sun-100 to-sun-200 shadow-clay-sun sm:size-72">
          <PromptArt promptId={prompt.id} className="size-44 sm:size-52" strokeWidth={4} title={prompt.label} />
        </div>
      </div>
      <h1 className="text-outlined mt-8 font-display text-[64px] font-bold uppercase leading-none tracking-[-0.02em] text-violet-500">
        {prompt.label}
      </h1>
      <p className="mt-3 text-[15px] font-semibold text-plum-500">Tip: {prompt.hint}</p>
      <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border-2 border-white bg-cream-50 px-5 py-3 shadow-soft">
        <span className="text-sm font-bold text-plum-500">Drawing starts in</span>
        <span aria-live="polite" className="flex size-10 items-center justify-center rounded-xl bg-violet-500 font-display text-xl font-bold text-white shadow-clay-violet">
          {startsIn}
        </span>
      </div>
    </div>
  );
}
