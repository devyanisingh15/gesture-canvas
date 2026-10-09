import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type Tone = "cream" | "white" | "sun" | "violet";

const TONES: Record<Tone, string> = {
  cream: "bg-cream-100 border-white",
  white: "bg-white/85 border-white backdrop-blur",
  sun: "bg-gradient-to-b from-sun-100 to-sun-200 border-sun-300",
  violet: "bg-violet-50 border-violet-200",
};

interface CardProps extends ComponentPropsWithoutRef<"div"> {
  tone?: Tone;
}

/** Rounded "clay" surface used for every panel in the prototype. */
export function Card({ tone = "cream", className, ...rest }: CardProps) {
  return <div {...rest} className={cn("rounded-card border-2 shadow-card", TONES[tone], className)} />;
}
