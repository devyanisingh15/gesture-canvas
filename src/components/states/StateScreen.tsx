import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

type Tone = "danger" | "sun" | "violet";

const ICON_TONES: Record<Tone, string> = {
  danger: "bg-danger-100 text-danger-500",
  sun: "bg-sun-100 text-sun-600",
  violet: "bg-violet-100 text-violet-600",
};

interface StateScreenProps {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  description: string;
  children?: ReactNode;
  actions?: ReactNode;
}

/** Centered card for error and interruption states. */
export function StateScreen({ icon, tone = "violet", title, description, children, actions }: StateScreenProps) {
  return (
    <Card className="mx-auto w-full max-w-lg p-7 text-center sm:p-9 animate-fade-up">
      <span className={cn("mx-auto flex size-16 items-center justify-center rounded-2xl", ICON_TONES[tone])}>{icon}</span>
      <h1 className="mt-5 text-[28px] font-semibold leading-tight text-plum-700">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-plum-500">{description}</p>
      {children && <div className="mt-6">{children}</div>}
      {actions && <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">{actions}</div>}
    </Card>
  );
}
