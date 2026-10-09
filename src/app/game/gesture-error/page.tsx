import { HandMetal, RefreshCw } from "lucide-react";
import { CameraPreview } from "@/components/game/CameraPreview";
import { GestureIndicator } from "@/components/game/GestureIndicator";
import { ScreenContainer } from "@/components/layout/AppShell";
import { StateScreen } from "@/components/states/StateScreen";
import { Button } from "@/components/ui/Button";
import { PHASE_ROUTES } from "@/features/game/routes";

const TIPS = ["Move into better light", "Keep your whole hand in the frame", "Hold your index finger up, other fingers curled"];

export default function GestureErrorPage() {
  return (
    <ScreenContainer className="py-12">
      <StateScreen
        tone="danger"
        icon={<HandMetal className="size-8" aria-hidden />}
        title="We can't see your hand"
        description="Drawing is paused until your hand is back in view. The round timer keeps running."
        actions={
          <>
            <Button href={PHASE_ROUTES.DRAWING} iconLeft={<RefreshCw className="size-4" aria-hidden />}>
              Try again
            </Button>
            <Button href="/game/camera" variant="secondary">
              Check camera
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4">
          <GestureIndicator status="not-detected" />
          <CameraPreview handVisible={false} className="w-full max-w-xs" />
          <ul className="w-full max-w-xs space-y-2 text-left">
            {TIPS.map((tip) => (
              <li key={tip} className="flex items-center gap-2.5 text-sm font-semibold text-plum-600">
                <span className="size-1.5 shrink-0 rounded-full bg-violet-400" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </StateScreen>
    </ScreenContainer>
  );
}
