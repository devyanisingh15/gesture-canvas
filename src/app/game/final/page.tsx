import { Home, RotateCcw } from "lucide-react";
import { FinalResultsScreen } from "@/components/screens/FinalResultsScreen";
import { Button } from "@/components/ui/Button";
import { MOCK_FINAL_LEADERBOARD } from "@/mocks/game";

export default function FinalResultsPage() {
  return (
    <FinalResultsScreen
      leaderboard={MOCK_FINAL_LEADERBOARD}
      actions={
        <>
          <Button href="/game/lobby" size="lg" fullWidth iconLeft={<RotateCcw className="size-4" aria-hidden />}>
            Play again
          </Button>
          <Button href="/" variant="secondary" size="lg" fullWidth iconLeft={<Home className="size-4" aria-hidden />}>
            Home
          </Button>
        </>
      }
    />
  );
}
