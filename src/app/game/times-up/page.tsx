"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ScreenContainer } from "@/components/layout/AppShell";
import { TimesUpScreen } from "@/components/screens/TimesUpScreen";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROOM, MOCK_ROUND_RESULTS } from "@/mocks/game";

export default function TimesUpPage() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => router.push(PHASE_ROUTES.EVALUATING), 3000);
    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <ScreenContainer className="flex flex-col items-center py-14 text-center">
      <TimesUpScreen strokes={MOCK_ROUND_RESULTS[0]!.strokes} submitted={MOCK_ROOM.players.length - 1} total={MOCK_ROOM.players.length} />
    </ScreenContainer>
  );
}
