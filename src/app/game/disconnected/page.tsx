import { WifiOff } from "lucide-react";
import { PlayerCard } from "@/components/game/PlayerCard";
import { ScreenContainer } from "@/components/layout/AppShell";
import { StateScreen } from "@/components/states/StateScreen";
import { Button } from "@/components/ui/Button";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_PLAYERS } from "@/mocks/game";

export default function PlayerDisconnectedPage() {
  const lost = { ...MOCK_PLAYERS[1]!, connection: "disconnected" as const };
  return (
    <ScreenContainer className="py-12">
      <StateScreen
        tone="sun"
        icon={<WifiOff className="size-8" aria-hidden />}
        title={`${lost.name} disconnected`}
        description={`We're holding ${lost.name}'s spot for a moment. Their drawing so far is saved.`}
        actions={
          <>
            <Button href={PHASE_ROUTES.DRAWING}>Keep playing</Button>
            <Button href="/game/lobby" variant="secondary">
              Back to lobby
            </Button>
          </>
        }
      >
        <div className="mx-auto flex max-w-xs flex-col gap-2.5">
          <PlayerCard
            player={lost}
            variant="row"
            trailing={<span className="text-[11px] font-bold text-sun-600">Reconnecting…</span>}
          />
          <p className="text-xs font-bold text-plum-400">The game continues without them after 30 seconds.</p>
        </div>
      </StateScreen>
    </ScreenContainer>
  );
}
