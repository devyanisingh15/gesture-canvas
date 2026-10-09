import { GameLobby } from "@/components/game/GameLobby";
import { ScreenContainer } from "@/components/layout/AppShell";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROOM } from "@/mocks/game";

export default function LobbyPage() {
  return (
    <ScreenContainer>
      <GameLobby room={MOCK_ROOM} startHref={PHASE_ROUTES.WHEEL_SPINNING} />
    </ScreenContainer>
  );
}
