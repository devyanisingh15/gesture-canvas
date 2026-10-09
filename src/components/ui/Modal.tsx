import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}

/** Centered dialog over a blurred plum scrim. */
export function Modal({ open, labelledBy, className, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-plum-900/35 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "w-full max-w-md animate-pop rounded-card border-2 border-white bg-cream-100 p-7 shadow-card sm:p-8",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
