import { PromptArt } from "@/components/art/PromptArt";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { DrawingPrompt, Player, PlayerRoundResult } from "@/features/game/types";
import { cn } from "@/lib/cn";
import { AccuracyBadge } from "./AccuracyBadge";
import { DrawingCanvas } from "./DrawingCanvas";
import { ScoreBreakdownList } from "./ScoreBreakdownList";

interface ScoreCardProps {
  player: Player;
  prompt: DrawingPrompt;
  result: PlayerRoundResult;
}

/** Your round result: target vs. your drawing, accuracy and score breakdown. */
export function ScoreCard({ player, prompt, result }: ScoreCardProps) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Avatar name={player.name} color={player.avatar} size="sm" />
        <h2 className="text-lg font-semibold text-plum-700">Your drawing</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Figure label="Target">
          <div className="flex aspect-[4/3] items-center justify-center rounded-[18px] border-2 border-sun-300 bg-gradient-to-b from-sun-100 to-sun-200">
            <PromptArt promptId={prompt.id} className="h-[80%] w-[80%]" title={`Target: ${prompt.label}`} />
          </div>
        </Figure>
        <Figure label="You drew">
          <DrawingCanvas strokes={result.strokes} grid label={`${player.name}'s drawing`} />
        </Figure>
      </div>
      <div className="mt-5 grid items-center gap-5 sm:grid-cols-[auto_1fr]">
        <AccuracyBadge value={result.score.totalScore} size="lg" className="justify-self-center" />
        <ScoreBreakdownList score={result.score} />
      </div>
    </Card>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure>
      {children}
      <figcaption className="mt-2 text-center text-[11px] font-extrabold uppercase tracking-[0.14em] text-plum-400">{label}</figcaption>
    </figure>
  );
}

/** Small thumbnail of another player's drawing with their score. */
export function DrawingThumb({ player, result, className }: { player: Player; result: PlayerRoundResult; className?: string }) {
  return (
    <div className={cn("rounded-2xl border-2 border-white bg-cream-50 p-2.5 shadow-soft", className)}>
      <DrawingCanvas strokes={result.strokes} label={`${player.name}'s drawing`} className="rounded-xl" />
      <div className="mt-2 flex items-center gap-2 px-1">
        <Avatar name={player.name} color={player.avatar} size="sm" className="size-6 text-[10px] ring-2" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-plum-700">{player.name}</span>
        <span className="font-display text-sm font-bold text-mint-600">{result.score.totalScore}%</span>
      </div>
    </div>
  );
}
