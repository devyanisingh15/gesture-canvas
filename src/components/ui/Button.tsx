import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "pink" | "sun" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-b from-violet-400 to-violet-600 border border-violet-600/40 shadow-clay-violet hover:brightness-105 active:translate-y-[3px] active:shadow-clay-violet-pressed",
  secondary:
    "text-plum-700 bg-gradient-to-b from-cream-50 to-cream-100 border border-violet-200/80 shadow-clay-cream hover:bg-cream-50 active:translate-y-[3px] active:shadow-none",
  pink:
    "text-white bg-gradient-to-b from-pink-400 to-pink-500 border border-pink-600/30 shadow-clay-pink hover:brightness-105 active:translate-y-[3px] active:shadow-none",
  sun:
    "text-plum-800 bg-gradient-to-b from-sun-200 to-sun-300 border border-sun-400/60 shadow-clay-sun hover:brightness-105 active:translate-y-[3px] active:shadow-none",
  ghost: "text-plum-600 hover:bg-white/60",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px] rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-2xl gap-2",
  lg: "h-[52px] px-7 text-[15px] rounded-2xl gap-2.5",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  ({ href: string } | ({ href?: undefined } & Omit<ComponentPropsWithoutRef<"button">, "children" | "className">));

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", iconLeft, iconRight, fullWidth, className, children } = props;
  const classes = cn(
    "inline-flex select-none items-center justify-center font-sans font-extrabold tracking-[0.01em] transition-all duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
  const content = (
    <>
      {iconLeft}
      <span>{children}</span>
      {iconRight}
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={classes}>
        {content}
      </Link>
    );
  }

  const { variant: _v, size: _s, iconLeft: _l, iconRight: _r, fullWidth: _f, className: _c, children: _ch, href: _h, ...rest } = props;
  return (
    <button type="button" {...rest} className={classes}>
      {content}
    </button>
  );
}
