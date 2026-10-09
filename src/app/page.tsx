import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AppShell } from "@/components/layout/AppShell";

export default function LandingPage() {
  return (
    <AppShell>
      <Hero />
      <HowItWorks />
    </AppShell>
  );
}
