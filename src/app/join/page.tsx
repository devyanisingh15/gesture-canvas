import { Suspense } from "react";
import { JoinGameForm } from "./JoinGameForm";
import { AppShell, ScreenContainer } from "@/components/layout/AppShell";
import { BackLink } from "@/components/layout/BackLink";

export default function JoinGamePage() {
  return (
    <AppShell>
      <ScreenContainer className="max-w-[560px]">
        <BackLink href="/" />
        <Suspense>
          <JoinGameForm />
        </Suspense>
      </ScreenContainer>
    </AppShell>
  );
}
