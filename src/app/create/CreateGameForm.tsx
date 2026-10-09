"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker } from "@/components/forms/AvatarPicker";
import { Segmented } from "@/components/forms/Segmented";
import { TextField } from "@/components/forms/TextField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AvatarColor } from "@/features/game/types";

export function CreateGameForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarColor>("violet");
  const [rounds, setRounds] = useState(3);
  const [seconds, setSeconds] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Pick a name so your friends know who's drawing.");
      return;
    }
    setSubmitting(true);
    // Phase 4: create the game on the server, then route to its lobby.
    router.push("/game/lobby");
  };

  return (
    <Card className="p-6 sm:p-8">
      <Badge tone="violet" uppercase>
        New game
      </Badge>
      <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700">Create a game</h1>
      <p className="mt-1.5 text-[15px] text-plum-500">Set up a room and invite up to 5 friends.</p>
      <form onSubmit={submit} className="mt-7 flex flex-col gap-5" noValidate>
        <TextField
          label="Your name"
          placeholder="e.g. Maya"
          maxLength={16}
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
        />
        <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
        <Segmented label="Rounds" options={[{ value: 3, label: "3" }, { value: 5, label: "5" }, { value: 7, label: "7" }]} value={rounds} onChange={setRounds} />
        <Segmented label="Drawing time" options={[{ value: 30, label: "30s" }, { value: 60, label: "60s" }, { value: 90, label: "90s" }]} value={seconds} onChange={setSeconds} />
        <Segmented
          label="Max players"
          options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
          value={maxPlayers}
          onChange={setMaxPlayers}
        />
        <Button type="submit" size="lg" fullWidth className="mt-2" disabled={submitting} iconRight={<ArrowRight className="size-4" aria-hidden />}>
          {submitting ? "Creating room…" : "Create Game"}
        </Button>
      </form>
    </Card>
  );
}
