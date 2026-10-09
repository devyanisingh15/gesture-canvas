"use client";

import { useRouter } from "next/navigation";
import { ScreenContainer } from "@/components/layout/AppShell";
import { EvaluatingScreen } from "@/components/screens/EvaluatingScreen";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROUND_RESULTS } from "@/mocks/game";

export default function EvaluatingPage() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <EvaluatingScreen strokes={MOCK_ROUND_RESULTS[0]!.strokes} onDone={() => router.push(PHASE_ROUTES.ROUND_RESULTS)} />
    </ScreenContainer>
  );
}
