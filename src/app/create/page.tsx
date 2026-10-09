import { CreateGameForm } from "./CreateGameForm";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { BackLink } from "@/components/layout/BackLink";

export default function CreateGamePage() {
  return (
    <AppShell>
      <ScreenContainer className="max-w-[560px]">
        <BackLink href="/" />
        <CreateGameForm />
      </ScreenContainer>
    </AppShell>
  );
}
