import { ArrowRight, Camera, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { HeroGameCard } from "./HeroGameCard";

const FEATURES = [
  { icon: Camera, label: "Camera-powered" },
  { icon: Sparkles, label: "AI-scored" },
  { icon: Users, label: "2–6 players" },
] as const;

export function Hero() {
  return (
    <section className="mx-auto grid max-w-[1280px] items-center gap-10 overflow-x-clip px-4 pb-16 pt-12 sm:px-10 lg:grid-cols-[1fr_1fr] lg:gap-12 lg:pb-20 lg:pt-14">
      <div className="max-w-[480px]">
        <Badge tone="teal" dot>
          Multiplayer gesture game
        </Badge>
        <Wordmark className="mt-4" />
        <p className="mt-5 font-display text-[28px] font-semibold leading-[1.25] text-plum-700 sm:text-[32px]">
          Draw with your hands.
          <br />
          <span className="text-violet-500">
            <span className="underline-sun">Beat</span> <span className="underline-sun">your friends.</span>
          </span>
        </p>
        <p className="mt-5 max-w-[450px] text-[17px] leading-relaxed text-plum-500">
          A multiplayer drawing game powered by your camera and gestures. No mouse. No limits.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button href="/create" size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Create Game
          </Button>
          <Button href="/join" variant="secondary" size="lg" iconLeft={<Users className="size-4" aria-hidden />}>
            Join Game
          </Button>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-plum-500">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <HeroGameCard />
    </section>
  );
}
