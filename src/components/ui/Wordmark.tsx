import { cn } from "@/lib/cn";

/** Chunky two-tone hero wordmark: "GESTURE" (plum) over "CANVAS" (pink). */
export function Wordmark({ className, size = "lg" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <h1
      className={cn(
        "font-display font-bold uppercase leading-[0.86] tracking-[-0.03em]",
        size === "lg" ? "text-[56px] sm:text-[68px]" : "text-[40px]",
        className,
      )}
    >
      <span className="text-outlined block text-plum-700">Gesture</span>
      <span className="text-outlined block pl-[0.5em] text-pink-400">Canvas</span>
    </h1>
  );
}
