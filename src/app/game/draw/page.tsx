"use client";

import { useRouter } from "next/navigation";
import { ScreenContainer } from "@/components/layout/AppShell";
import { DrawScreen } from "@/components/screens/DrawScreen";
import { getPrompt } from "@/features/game/prompts";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROOM } from "@/mocks/game";

export default function DrawPage() {
  const router = useRouter();
  const timeUp = () => router.push(PHASE_ROUTES.TIME_UP);
  return (
    <ScreenContainer className="py-6 sm:py-8">
      <DrawScreen
        prompt={getPrompt(MOCK_ROOM.targetPromptId)}
        total={MOCK_ROOM.settings.drawSeconds}
        players={MOCK_ROOM.players}
        onTimeUp={timeUp}
        onEndRound={timeUp}
        endRoundLabel="End round (preview)"
      />
    </ScreenContainer>
  );
}
