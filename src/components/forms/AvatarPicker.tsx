import { Avatar, AVATAR_COLORS } from "@/components/ui/Avatar";
import type { AvatarColor } from "@/features/game/types";
import { cn } from "@/lib/cn";

interface AvatarPickerProps {
  name: string;
  value: AvatarColor;
  onChange: (color: AvatarColor) => void;
}

export function AvatarPicker({ name, value, onChange }: AvatarPickerProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-extrabold text-plum-600">Avatar color</legend>
      <div className="flex flex-wrap gap-2.5">
        {AVATAR_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value === color}
            aria-label={color}
            onClick={() => onChange(color)}
            className={cn("rounded-full p-0.5 transition", value === color ? "ring-4 ring-violet-300" : "opacity-70 hover:opacity-100")}
          >
            <Avatar name={name || "?"} color={color} size="sm" />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
