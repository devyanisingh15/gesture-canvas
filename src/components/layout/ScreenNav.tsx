import { LayoutGrid } from "lucide-react";
import Link from "next/link";

/** Preview-only shortcut to the screen index. Remove once the game runs on real state. */
export function ScreenNav() {
  return (
    <Link
      href="/screens"
      className="fixed bottom-4 left-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/85 px-3 py-1.5 text-[11px] font-extrabold text-plum-500 shadow-soft backdrop-blur hover:text-violet-600"
    >
      <LayoutGrid className="size-3.5" aria-hidden /> All screens
    </Link>
  );
}
