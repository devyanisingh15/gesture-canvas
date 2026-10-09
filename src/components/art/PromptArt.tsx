import { PROMPT_ART, type Polyline } from "@/features/game/promptArt";
import type { PromptId } from "@/features/game/types";
import { cn } from "@/lib/cn";

function toPath(line: Polyline): string {
  return line.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

interface PromptArtProps {
  promptId: PromptId;
  className?: string;
  strokeWidth?: number;
  color?: string;
  title?: string;
}

/** Violet line-art illustration of a prompt, as drawn on the hero canvas. */
export function PromptArt({ promptId, className, strokeWidth = 3.2, color = "currentColor", title }: PromptArtProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("text-violet-500", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {PROMPT_ART[promptId].map((line, i) => (
        <path
          key={i}
          d={toPath(line)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
