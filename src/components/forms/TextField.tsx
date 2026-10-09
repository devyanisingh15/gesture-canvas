import { useId, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

interface TextFieldProps extends Omit<ComponentPropsWithoutRef<"input">, "id"> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, className, ...rest }: TextFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-extrabold text-plum-600">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...rest}
        className={cn(
          "h-12 w-full rounded-2xl border-2 bg-white px-4 font-display text-lg font-medium text-plum-700 shadow-[inset_0_2px_0_rgb(74_45_110/0.05)] outline-none transition placeholder:text-plum-300",
          "focus:border-violet-400 focus:ring-4 focus:ring-violet-100",
          error ? "border-danger-400" : "border-violet-200",
        )}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-bold text-danger-500">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs font-semibold text-plum-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
