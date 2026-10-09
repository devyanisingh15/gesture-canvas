"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker } from "@/components/forms/AvatarPicker";
import { TextField } from "@/components/forms/TextField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AvatarColor } from "@/features/game/types";
import { MOCK_ROOM } from "@/mocks/game";

const CODE_LENGTH = 6;

export function JoinGameForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarColor>("pink");
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (code.length !== CODE_LENGTH) next.code = `Room codes are ${CODE_LENGTH} characters.`;
    // Phase 4: look the room up on the server. The mock only knows one room.
    else if (code !== MOCK_ROOM.code) next.code = `We couldn't find room ${code}. Check the code and try again.`;
    if (!name.trim()) next.name = "Pick a name so your friends know who's drawing.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    router.push("/game/lobby");
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
            hint={`Try ${MOCK_ROOM.code} in this preview.`}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              setErrors((x) => ({ ...x, code: undefined }));
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
            setErrors((x) => ({ ...x, name: undefined }));
          }}
        />
        <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
        <Button type="submit" size="lg" fullWidth className="mt-2" disabled={submitting} iconRight={<ArrowRight className="size-4" aria-hidden />}>
          {submitting ? "Joining…" : "Join Game"}
        </Button>
      </form>
    </Card>
  );
}
