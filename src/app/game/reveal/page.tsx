"use client";

import { useRouter } from "next/navigation";
import { TargetReveal } from "@/components/game/TargetReveal";
import { ScreenContainer } from "@/components/layout/AppShell";
import { getPrompt } from "@/features/game/prompts";
import { PHASE_ROUTES } from "@/features/game/routes";
import { useCountdown } from "@/hooks/useCountdown";
import { MOCK_ROOM } from "@/mocks/game";

export default function RevealPage() {
  const router = useRouter();
  const startsIn = useCountdown(5, { onEnd: () => router.push(PHASE_ROUTES.DRAWING) });
  return (
    <ScreenContainer className="py-12">
      <TargetReveal prompt={getPrompt(MOCK_ROOM.targetPromptId)} startsIn={startsIn} />
    </ScreenContainer>
  );
}
