import { ScreenContainer } from "@/components/layout/AppShell";
import { DrawScreen } from "./DrawScreen";

export default function DrawPage() {
  return (
    <ScreenContainer className="py-6 sm:py-8">
      <DrawScreen />
    </ScreenContainer>
  );
}
