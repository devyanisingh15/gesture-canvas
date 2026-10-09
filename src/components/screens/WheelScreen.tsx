"use client";

import { useEffect, useState } from "react";
import { GameWheel } from "@/components/game/GameWheel";
import { PlayerCard } from "@/components/game/PlayerCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getPrompt } from "@/features/game/prompts";
import type { PlayerView, PromptId } from "@/features/game/types";

interface WheelScreenProps {
  round: number;
  totalRounds: number;
  /** Prompt the server picked; the wheel only animates to it. */
  targetId: PromptId;
  players: PlayerView[];
  /** Spin straight away (live games: the server already started the phase). */
  autoSpin?: boolean;
  onLanded?: () => void;
}

export function WheelScreen({ round, totalRounds, targetId, players, autoSpin = false, onLanded }: WheelScreenProps) {
  const [state, setState] = useState<"idle" | "spinning" | "landed">(autoSpin ? "spinning" : "idle");
  const target = getPrompt(targetId);
  const isHost = players.some((p) => p.isYou && p.isHost);

  useEffect(() => {
    if (autoSpin) setState("spinning");
  }, [autoSpin, targetId]);

  const onSpinEnd = () => {
    setState("landed");
    onLanded?.();
  };

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col items-center text-center">
        <Badge tone="violet" uppercase>
          Round {round} of {totalRounds}
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
        {players.map((p) => (
          <PlayerCard key={p.id} player={p} variant="row" />
        ))}
      </aside>
    </div>
  );
}
