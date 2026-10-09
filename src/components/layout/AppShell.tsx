import type { ReactNode } from "react";
import { BackgroundDecor } from "@/components/art/Decorations";
import { cn } from "@/lib/cn";
import { SiteHeader } from "./SiteHeader";

interface AppShellProps {
  header?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Gradient page frame shared by every screen. */
export function AppShell({ header, className, children }: AppShellProps) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {header ?? <SiteHeader />}
      <main className={cn("bg-canvas-gradient relative flex-1", className)}>
        <BackgroundDecor />
        <div className="relative">{children}</div>
      </main>
    </div>
  );
}

/** Centered content column for game screens. */
export function ScreenContainer({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-8 sm:py-12", className)}>{children}</div>;
}
