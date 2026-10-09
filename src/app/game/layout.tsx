import { GameHeader } from "@/components/game/GameHeader";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenNav } from "@/components/layout/ScreenNav";
import { MOCK_ROOM } from "@/mocks/game";

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      header={
        <GameHeader
          round={MOCK_ROOM.currentRound}
          totalRounds={MOCK_ROOM.settings.rounds}
          roomCode={MOCK_ROOM.code}
          playerCount={MOCK_ROOM.players.length}
        />
      }
    >
      {children}
      <ScreenNav />
    </AppShell>
  );
}
