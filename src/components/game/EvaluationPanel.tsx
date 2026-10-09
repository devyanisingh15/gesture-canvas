"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import { BREAKDOWN_ROWS } from "./ScoreBreakdownList";

const STEP_MS = 900;

/** Animated checklist shown while drawings are being scored. */
export function EvaluationPanel({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const total = BREAKDOWN_ROWS.length;

  useEffect(() => {
    if (step >= total) {
      const id = window.setTimeout(() => onDone?.(), 700);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, total]);

  return (
    <Card className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-plum-700">Scoring drawings</h2>
        <span className="font-display text-sm font-bold text-violet-500">{Math.round((step / total) * 100)}%</span>
      </div>
      <ProgressBar value={(step / total) * 100} label="Evaluation progress" />
      <ul className="mt-5 flex flex-col gap-2.5">
        {BREAKDOWN_ROWS.map((row, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={row.key}
              className={cn(
                "flex items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-sm font-bold transition-colors",
                done ? "border-mint-200 bg-mint-50 text-mint-700" : active ? "border-violet-200 bg-violet-50 text-violet-700" : "border-transparent bg-white/50 text-plum-400",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full",
                  done ? "bg-mint-400 text-white" : active ? "bg-violet-100 text-violet-500" : "bg-plum-300/30",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : active ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              </span>
              Checking {row.label.toLowerCase()}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
