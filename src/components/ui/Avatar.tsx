import { cn } from "@/lib/cn";
import type { AvatarColor } from "@/features/game/types";

const COLORS: Record<AvatarColor, string> = {
  violet: "from-violet-300 to-violet-500 text-white",
  pink: "from-pink-300 to-pink-500 text-white",
  sun: "from-sun-200 to-sun-400 text-plum-800",
  mint: "from-mint-200 to-mint-400 text-plum-800",
  sky: "from-sky-200 to-sky-400 text-plum-800",
  peach: "from-orange-200 to-orange-300 text-plum-800",
};

const SIZES = { sm: "size-8 text-xs", md: "size-11 text-base", lg: "size-16 text-2xl", xl: "size-24 text-4xl" };

interface AvatarProps {
  name: string;
  color: AvatarColor;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ name, color, size = "md", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-bold ring-[3px] ring-white shadow-soft",
        COLORS[color],
        SIZES[size],
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export const AVATAR_COLORS = Object.keys(COLORS) as AvatarColor[];
