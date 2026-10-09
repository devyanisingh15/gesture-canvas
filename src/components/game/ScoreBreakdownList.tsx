import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ScoreBreakdown } from "@/features/game/types";

export const BREAKDOWN_ROWS = [
  { key: "shapeScore", label: "Shape", tone: "violet" },
  { key: "structureScore", label: "Structure", tone: "pink" },
  { key: "completenessScore", label: "Completeness", tone: "sun" },
  { key: "compositionScore", label: "Composition", tone: "mint" },
] as const satisfies ReadonlyArray<{ key: keyof ScoreBreakdown; label: string; tone: string }>;

export function ScoreBreakdownList({ score }: { score: ScoreBreakdown }) {
  return (
    <dl className="flex flex-col gap-3">
      {BREAKDOWN_ROWS.map((row) => (
        <div key={row.key}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <dt className="text-[13px] font-bold text-plum-600">{row.label}</dt>
            <dd className="font-display text-sm font-bold text-plum-700">{score[row.key]}</dd>
          </div>
          <ProgressBar value={score[row.key]} tone={row.tone} label={`${row.label} score`} />
        </div>
      ))}
    </dl>
  );
}
