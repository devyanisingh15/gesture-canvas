import { cn } from "@/lib/cn";

/**
 * Mirrored webcam preview. Phase 1 shows an illustrated hand with landmark
 * dots; Phase 2 renders the real <video> stream underneath the same frame.
 */
export function CameraPreview({ handVisible = true, className }: { handVisible?: boolean; className?: string }) {
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-2xl border-2 border-white bg-gradient-to-br from-plum-700 to-plum-900 shadow-soft", className)}>
      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-white">
        <span className="size-1.5 animate-blink rounded-full bg-danger-400" /> Live
      </span>
      {handVisible ? (
        <svg viewBox="0 0 160 90" className="absolute inset-0 size-full" aria-label="Hand tracked by camera" role="img">
          <g stroke="#c4affc" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.9">
            <path d="M80 82 L72 62 L70 48 L74 30 L76 14" />
            <path d="M72 62 L82 54 L86 46" />
            <path d="M80 82 L90 64 L96 56" />
            <path d="M80 82 L96 70 L102 64" />
            <path d="M72 62 L62 58 L56 52" />
          </g>
          {[[76, 14], [74, 30], [70, 48], [72, 62], [80, 82], [86, 46], [82, 54], [96, 56], [90, 64], [102, 64], [96, 70], [56, 52], [62, 58]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 0 ? 3.2 : 1.8} fill={i === 0 ? "#8b5cf6" : "#fff"} stroke={i === 0 ? "#fff" : "none"} />
          ))}
        </svg>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/60">No hand in frame</div>
      )}
    </div>
  );
}
