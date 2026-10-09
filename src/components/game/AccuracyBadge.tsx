import { cn } from "@/lib/cn";

/** Yellow "ACCURACY 94%" card from the hero game mock. */
export function AccuracyBadge({ value, size = "md", className }: { value: number; size?: "md" | "lg"; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center rounded-2xl border-2 border-sun-300 bg-gradient-to-b from-sun-100 to-sun-200 shadow-clay-sun",
        size === "lg" ? "px-7 py-4" : "px-4 py-2.5",
        className,
      )}
    >
      <span className={cn("font-extrabold uppercase tracking-[0.16em] text-sun-600", size === "lg" ? "text-[11px]" : "text-[8px]")}>
        Accuracy
      </span>
      <span className={cn("font-display font-bold leading-none text-mint-600", size === "lg" ? "mt-1 text-5xl" : "mt-0.5 text-2xl")}>
        {value}%
      </span>
    </div>
  );
}
