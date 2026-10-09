"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GameWheel } from "@/components/game/GameWheel";
import { PlayerCard } from "@/components/game/PlayerCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getPrompt } from "@/features/game/prompts";
import { PHASE_ROUTES } from "@/features/game/routes";
import { MOCK_ROOM } from "@/mocks/game";

export function WheelScreen() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "spinning" | "landed">("idle");
  const target = getPrompt(MOCK_ROOM.targetPromptId);
  const isHost = MOCK_ROOM.players.some((p) => p.isYou && p.isHost);

  const onSpinEnd = () => {
    setState("landed");
    window.setTimeout(() => router.push(PHASE_ROUTES.TARGET_REVEALED), 1400);
  };

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col items-center text-center">
        <Badge tone="violet" uppercase>
          Round {MOCK_ROOM.currentRound} of {MOCK_ROOM.settings.rounds}
        </Badge>
        <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700 sm:text-[40px]">
          {state === "landed" ? (
            <>
              It&apos;s a <span className="text-violet-500">{target.label}!</span>
            </>
          ) : (
            "Spin for a prompt"
          )}
        </h1>
        <p className="mt-2 text-[15px] text-plum-500">Everyone will draw whatever the wheel lands on.</p>
        <GameWheel targetId={target.id} spinning={state !== "idle"} onSpinEnd={onSpinEnd} className="mt-12" />
        <div className="mt-10 h-[52px]">
          {state === "idle" &&
            (isHost ? (
              <Button size="lg" onClick={() => setState("spinning")}>
                Spin the wheel
              </Button>
            ) : (
              <p className="font-bold text-plum-400">Waiting for the host to spin…</p>
            ))}
          {state === "spinning" && <p className="font-display text-lg font-semibold text-violet-500">Spinning…</p>}
        </div>
      </div>
      <aside className="flex flex-col gap-2.5">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-plum-400">Players</h2>
        {MOCK_ROOM.players.map((p) => (
          <PlayerCard key={p.id} player={p} variant="row" />
        ))}
      </aside>
    </div>
  );
}
