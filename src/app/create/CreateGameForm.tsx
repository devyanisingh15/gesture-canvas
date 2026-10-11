"use client";

import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AvatarPicker } from "@/components/forms/AvatarPicker";
import { Segmented } from "@/components/forms/Segmented";
import { TextField } from "@/components/forms/TextField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AvatarColor } from "@/features/game/types";
import { DEFAULT_DRAW_SECONDS, DEFAULT_ROUNDS } from "@/features/game/state";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getGameClient, saveSession } from "@/services/gameClient";
import { createGame, GameRequestError, saveGameSession } from "@/services/supabaseGames";

/** A failure the player can act on: on the name field, or a banner with an optional retry. */
type FormError = { field: "name"; message: string } | { field: "form"; message: string; retryable: boolean };

export function CreateGameForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarColor>("violet");
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [seconds, setSeconds] = useState<number>(DEFAULT_DRAW_SECONDS);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [error, setError] = useState<FormError>();
  const [submitting, setSubmitting] = useState(false);
  // Set synchronously, so a double-click can't start a second request before React re-renders.
  const inFlight = useRef(false);

  const create = async () => {
    if (inFlight.current) return;
    if (!name.trim()) {
      setError({ field: "name", message: "Pick a name so your friends know who's drawing." });
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(undefined);
    try {
      if (isSupabaseConfigured()) {
        const session = await createGame({ displayName: name, totalRounds: rounds, drawSeconds: seconds });
        saveGameSession(session);
        router.push(`/lobby/${session.roomCode}`);
      } else {
        const { session } = await getGameClient().createGame({ name, avatar }, { rounds, drawSeconds: seconds, maxPlayers });
        saveSession(session);
        router.push(`/room/${session.code}`);
      }
      // Stay disabled while the lobby loads.
    } catch (err) {
      inFlight.current = false;
      setSubmitting(false);
      if (err instanceof GameRequestError && err.kind === "invalid") {
        setError({ field: "name", message: err.message });
      } else {
        setError({
          field: "form",
          message: err instanceof Error ? err.message : "Couldn't create the game. Try again.",
          retryable: err instanceof GameRequestError ? err.retryable : true,
        });
      }
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void create();
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
          error={error?.field === "name" ? error.message : undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (error?.field === "name") setError(undefined);
          }}
        />
        <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
        <Segmented label="Rounds" options={[{ value: 3, label: "3" }, { value: 5, label: "5" }, { value: 7, label: "7" }]} value={rounds} onChange={setRounds} />
        <Segmented label="Drawing time" options={[{ value: 30, label: "30s" }, { value: 45, label: "45s" }, { value: 60, label: "60s" }]} value={seconds} onChange={setSeconds} />
        <Segmented
          label="Max players"
          options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
          value={maxPlayers}
          onChange={setMaxPlayers}
        />
        {error?.field === "form" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-100 px-4 py-2.5 text-sm font-bold text-danger-500">
            <span>{error.message}</span>
            {error.retryable && (
              <Button type="button" variant="secondary" size="sm" onClick={() => void create()} iconLeft={<RotateCcw className="size-4" aria-hidden />}>
                Try again
              </Button>
            )}
          </div>
        )}
        <Button
          type="submit"
          size="lg"
          fullWidth
          className="mt-2"
          disabled={submitting}
          aria-busy={submitting}
          iconRight={submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
        >
          {submitting ? "Creating room…" : "Create Game"}
        </Button>
      </form>
    </Card>
  );
}
