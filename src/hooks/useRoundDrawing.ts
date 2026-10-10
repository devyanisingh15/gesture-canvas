"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentRound } from "@/features/game/engine/stateMachine";
import type { Drawing, Game } from "@/features/game/engine/types";

const EMPTY: Drawing = { strokes: [] };

/**
 * This player's drawing for the current round. It lives above the drawing
 * screen so it survives that screen unmounting, and it is handed in once,
 * when the server says time is up.
 */
export function useRoundDrawing(game: Game | null, meId: string | undefined, submit: (drawing: Drawing) => void) {
  const round = game ? currentRound(game) : undefined;
  const roundNumber = round?.number ?? 0;
  const latest = useRef<Drawing>(EMPTY);
  const submittedRound = useRef(0);
  const [handedIn, setHandedIn] = useState<Drawing>(EMPTY);

  useEffect(() => {
    latest.current = EMPTY;
    setHandedIn(EMPTY);
  }, [roundNumber]);

  useEffect(() => {
    if (!game || !meId || game.phase !== "TIME_UP" || submittedRound.current === roundNumber) return;
    submittedRound.current = roundNumber;
    const drawing = latest.current;
    setHandedIn(drawing);
    if (!round?.drawings[meId]) submit(drawing);
  }, [game, meId, round, roundNumber, submit]);

  const onDrawingChange = useCallback((d: Drawing) => {
    latest.current = d;
  }, []);

  /** What to show as "your drawing": the stored one if the server has it, else what was handed in. */
  const shown = (meId && round?.drawings[meId]?.drawing) || handedIn;
  return { onDrawingChange, shown };
}
