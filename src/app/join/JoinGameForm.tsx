"use client";

import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { AvatarPicker } from "@/components/forms/AvatarPicker";
import { TextField } from "@/components/forms/TextField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AvatarColor } from "@/features/game/types";
import { CODE_LENGTH } from "@/features/game/protocol";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getGameClient, GameClientError, saveSession } from "@/services/gameClient";
import { GameRequestError, joinGame, normalizeRoomCode, saveGameSession, type GameRequestErrorKind } from "@/services/supabaseGames";

/** Which field a failed join is about; anything else shows as a banner. */
const CODE_ERRORS: GameRequestErrorKind[] = ["invalid-code", "not-found", "started", "full"];
const NAME_ERRORS: GameRequestErrorKind[] = ["name-taken", "invalid"];

type Errors = { code?: string; name?: string; form?: { message: string; retryable: boolean } };

const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);

export function JoinGameForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(() => cleanCode(params.get("code") ?? ""));
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarColor>("pink");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  // Set synchronously, so a double-click can't send a second request before React re-renders.
  const inFlight = useRef(false);
  const supabase = isSupabaseConfigured();

  const join = async () => {
    if (inFlight.current) return;
    const next: Errors = {};
    if (supabase ? !normalizeRoomCode(code) : code.length !== CODE_LENGTH) {
      next.code = code.length !== CODE_LENGTH ? `Room codes are ${CODE_LENGTH} characters.` : "That isn't a valid room code. Check it with your host.";
    }
    if (!name.trim()) next.name = "Pick a name so your friends know who's drawing.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      if (supabase) {
        const session = await joinGame({ roomCode: code, displayName: name });
        saveGameSession(session);
        router.push(`/lobby/${session.roomCode}`);
      } else {
        const { session } = await getGameClient().joinGame(code, { name, avatar });
        saveSession(session);
        router.push(`/room/${session.code}`);
      }
      // Stay disabled while the lobby loads.
    } catch (err) {
      inFlight.current = false;
      setSubmitting(false);
      const message = err instanceof Error ? err.message : "Couldn't join the game. Try again.";
      if (err instanceof GameRequestError) {
        if (CODE_ERRORS.includes(err.kind)) setErrors({ code: message });
        else if (NAME_ERRORS.includes(err.kind)) setErrors({ name: message });
        else setErrors({ form: { message, retryable: err.retryable } });
      } else {
        const kind = err instanceof GameClientError ? err.code : null;
        setErrors(kind === "NAME_TAKEN" || kind === "INVALID_INPUT" ? { name: message } : { code: message });
      }
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void join();
  };

  return (
    <Card className="p-6 sm:p-8">
      <Badge tone="pink" uppercase>
        Join
      </Badge>
      <h1 className="mt-4 text-[34px] font-semibold leading-tight text-plum-700">Join a game</h1>
      <p className="mt-1.5 text-[15px] text-plum-500">Enter the room code your host shared.</p>
      <form onSubmit={submit} className="mt-7 flex flex-col gap-5" noValidate>
        <div>
          <TextField
            label="Room code"
            placeholder="PX7K2Q"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={CODE_LENGTH}
            value={code}
            error={errors.code}
            hint="Six letters and numbers, like PX7K2Q."
            onChange={(e) => {
              setCode(cleanCode(e.target.value));
              setErrors((x) => ({ ...x, code: undefined, form: undefined }));
            }}
            className="[&_input]:text-center [&_input]:text-2xl [&_input]:font-bold [&_input]:tracking-[0.4em] [&_input]:uppercase"
          />
        </div>
        <TextField
          label="Your name"
          placeholder="e.g. Arjun"
          maxLength={16}
          value={name}
          error={errors.name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined, form: undefined }));
          }}
        />
        <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
        {errors.form && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-100 px-4 py-2.5 text-sm font-bold text-danger-500">
            <span>{errors.form.message}</span>
            {errors.form.retryable && (
              <Button type="button" variant="secondary" size="sm" onClick={() => void join()} iconLeft={<RotateCcw className="size-4" aria-hidden />}>
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
          {submitting ? "Joining…" : "Join Game"}
        </Button>
      </form>
    </Card>
  );
}
