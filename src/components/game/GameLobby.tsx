"use client";

import { Check, Copy, Play } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { GameRoom } from "@/features/game/types";
import { EmptySeat, PlayerCard } from "./PlayerCard";

interface GameLobbyProps {
  room: GameRoom;
  startHref: string;
}

export function GameLobby({ room, startHref }: GameLobbyProps) {
  const { players, settings } = room;
  const you = players.find((p) => p.isYou);
  const readyCount = players.filter((p) => p.isReady).length;
  const canStart = Boolean(you?.isHost) && readyCount >= 2;
  const openSeats = Math.max(0, settings.maxPlayers - players.length);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="players-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge tone="violet" uppercase>
              Lobby
            </Badge>
            <h1 id="players-heading" className="mt-3 text-[34px] font-semibold leading-tight text-plum-700">
              Waiting for players
            </h1>
            <p className="mt-1 text-[15px] text-plum-500">
              {players.length} of {settings.maxPlayers} joined · {readyCount} ready
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {players.map((p) => (
            <PlayerCard key={p.id} player={p} />
          ))}
          {Array.from({ length: openSeats }, (_, i) => (
            <EmptySeat key={`seat-${i}`} />
          ))}
        </div>
      </section>

      <aside className="order-first flex flex-col gap-5 lg:order-none">
        <RoomCodeCard code={room.code} />
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-plum-700">Game settings</h2>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Setting label="Rounds" value={String(settings.rounds)} />
            <Setting label="Timer" value={`${settings.drawSeconds}s`} />
            <Setting label="Players" value={`2–${settings.maxPlayers}`} />
          </dl>
        </Card>
        <div className="flex flex-col gap-2">
          {canStart ? (
            <Button href={startHref} size="lg" fullWidth iconRight={<Play className="size-4 fill-current" aria-hidden />}>
              Start Game
            </Button>
          ) : (
            <Button size="lg" fullWidth disabled>
              Start Game
            </Button>
          )}
          <p className="text-center text-xs font-semibold text-plum-400">
            {you?.isHost ? "You can start once 2 players are ready." : "Waiting for the host to start."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-violet-50 px-2 py-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-plum-400">{label}</dt>
      <dd className="mt-1 font-display text-xl font-bold text-plum-700">{value}</dd>
    </div>
  );
}

function RoomCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Card tone="violet" className="p-5 text-center">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-600">Room code</span>
      <p className="mt-2 font-display text-[40px] font-bold leading-none tracking-[0.18em] text-plum-700">{code}</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={copy}
        iconLeft={copied ? <Check className="size-4 text-mint-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      >
        {copied ? "Copied" : "Copy invite code"}
      </Button>
    </Card>
  );
}
