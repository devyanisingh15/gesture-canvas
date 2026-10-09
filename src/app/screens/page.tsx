import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SCREEN_INDEX } from "@/features/game/routes";
import Link from "next/link";

/** Index of every Phase 1 screen for design review. */
export default function ScreensPage() {
  return (
    <AppShell>
      <ScreenContainer>
        <Badge tone="violet" uppercase>
          Preview
        </Badge>
        <h1 className="mt-4 text-[34px] font-semibold text-plum-700">All screens</h1>
        <p className="mt-1.5 text-[15px] text-plum-500">Every screen in the game flow, running on mock data.</p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCREEN_INDEX.map((s, i) => (
            <li key={s.href}>
              <Link href={s.href} className="block">
                <Card className="flex items-center gap-3 p-4 transition hover:-translate-y-0.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-violet-100 font-display font-bold text-violet-600">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-display text-lg font-semibold text-plum-700">{s.label}</span>
                    <span className="block text-xs font-bold text-plum-400">{s.href}</span>
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      </ScreenContainer>
    </AppShell>
  );
}
