import { Hand, Sparkles, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const STEPS = [
  { icon: Users, title: "Join a room", body: "Create a game and share the code. 2–6 players.", tone: "bg-violet-100 text-violet-600" },
  { icon: Sparkles, title: "Spin the wheel", body: "Everyone gets the same secret prompt.", tone: "bg-pink-100 text-pink-600" },
  { icon: Hand, title: "Draw in the air", body: "Raise your index finger and draw on camera.", tone: "bg-sun-100 text-sun-600" },
  { icon: Trophy, title: "Get scored", body: "AI checks accuracy. Highest score wins.", tone: "bg-mint-100 text-mint-700" },
] as const;

export function HowItWorks() {
  return (
    <section className="bg-section-blush border-t-2 border-white/80">
      <div className="mx-auto max-w-[1120px] px-4 py-20 text-center sm:px-8">
        <Badge tone="violet" uppercase>
          How it works
        </Badge>
        <h2 className="mt-5 text-[36px] font-semibold leading-tight text-plum-700 sm:text-[40px]">Four steps. One winner.</h2>
        <p className="mt-3 text-[15px] text-plum-500">Your hand is the controller. Your creativity does the rest.</p>
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body, tone }, i) => (
            <li key={title} className="relative rounded-card border-2 border-white bg-cream-50 p-6 text-left shadow-card">
              <span className="absolute right-5 top-5 font-display text-sm font-bold text-plum-300">0{i + 1}</span>
              <span className={cn("flex size-12 items-center justify-center rounded-2xl", tone)}>
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-4 text-xl font-semibold text-plum-700">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-plum-500">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
