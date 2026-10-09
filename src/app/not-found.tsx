import { Compass } from "lucide-react";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { StateScreen } from "@/components/states/StateScreen";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <AppShell>
      <ScreenContainer className="py-20">
        <StateScreen
          icon={<Compass className="size-8" aria-hidden />}
          title="This page wandered off"
          description="We couldn't find what you were looking for."
          actions={<Button href="/">Back to home</Button>}
        />
      </ScreenContainer>
    </AppShell>
  );
}
