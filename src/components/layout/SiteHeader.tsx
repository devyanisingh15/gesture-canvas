import type { ReactNode } from "react";
import { StatusDot } from "@/components/ui/Badge";
import { Logo } from "@/components/ui/Logo";

/** Cream top bar: logo on the left, gesture engine status (or custom content) on the right. */
export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/70 bg-cream-50/85 shadow-header backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-4 sm:px-8">
        <Logo />
        {right ?? <EngineStatus />}
      </div>
    </header>
  );
}

export function EngineStatus({ online = true }: { online?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-plum-500">
      <StatusDot tone={online ? "mint" : "danger"} />
      <span className="hidden sm:inline">Gesture engine</span>
      <span className={online ? "text-mint-600" : "text-danger-500"}>{online ? "Online" : "Offline"}</span>
    </span>
  );
}
