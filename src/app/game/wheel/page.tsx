"use client";

import { useRouter } from "next/navigation";
import { ScreenContainer } from "@/components/layout/AppShell";
import { WheelScreen } from "@/components/screens/WheelScreen";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROOM } from "@/mocks/game";

export default function WheelPage() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <WheelScreen
        round={MOCK_ROOM.currentRound}
        totalRounds={MOCK_ROOM.settings.rounds}
        targetId={MOCK_ROOM.targetPromptId}
        players={MOCK_ROOM.players}
        onLanded={() => window.setTimeout(() => router.push(PHASE_ROUTES.TARGET_REVEALED), 1400)}
      />
    </ScreenContainer>
  );
}
