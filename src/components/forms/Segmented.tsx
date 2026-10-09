import { cn } from "@/lib/cn";

interface SegmentedProps<T extends string | number> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** Pill radio group, e.g. rounds 3 / 5 / 7. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-extrabold text-plum-600">{label}</legend>
      <div className="flex gap-1.5 rounded-2xl border-2 border-violet-200 bg-violet-50 p-1">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={cn(
                "h-9 flex-1 rounded-xl font-display text-[15px] font-semibold transition",
                selected ? "bg-white text-violet-600 shadow-[0_2px_0_0_#dccfff]" : "text-plum-400 hover:text-plum-600",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
