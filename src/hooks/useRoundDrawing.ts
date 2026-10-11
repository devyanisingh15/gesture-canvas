"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentRound } from "@/features/game/engine/stateMachine";
import type { Drawing, Game } from "@/features/game/engine/types";
import { SUBMIT_GRACE_MS } from "@/features/game/state";

const EMPTY: Drawing = { strokes: [] };
/** How long to keep retrying a hand-in the server hasn't answered, past the point it would still accept it. */
const RETRY_SLACK_MS = 2_000;
const RETRY_EVERY_MS = 1_000;

export interface DrawingSaver {
  /**
   * Stores this player's drawing for a round on the server. Resolves "closed"
   * when the server won't take it any more (its deadline has passed); rejects
   * when it couldn't be reached, to be retried.
   */
  save: (roundNumber: number, drawing: Drawing, final: boolean) => Promise<"saved" | "closed">;
  /** The server's clock (ms). */
  serverNow: () => number;
  /** Also save work in progress this often while drawing (ms), so a refresh or dropped connection keeps it. 0: off. */
  checkpointMs?: number;
}

/**
 * This player's drawing for the current round. It lives above the drawing
 * screen so it survives that screen unmounting. It is handed in once, the
 * moment the round's server deadline passes (or the server says time is up),
 * and retried until the server takes it or refuses it as too late.
 */
export function useRoundDrawing(game: Game | null, meId: string | undefined, { save, serverNow, checkpointMs = 0 }: DrawingSaver) {
  const round = game ? currentRound(game) : undefined;
  const roundNumber = round?.number ?? 0;
  const endsAt = round?.drawingEndsAt ?? null;
  const phase = game?.phase;
  const serverCopy = (meId && round?.drawings[meId]?.drawing) || null;

  const latest = useRef<Drawing>(EMPTY);
  // Whether this tab drew (or resumed) this round; a tab that only saw the end must not overwrite the saved drawing.
  const touched = useRef(false);
  const lastSaved = useRef<Drawing | null>(null);
  const handedInRound = useRef(0);
  const [handedIn, setHandedIn] = useState<Drawing>(EMPTY);

  useEffect(() => {
    latest.current = EMPTY;
    touched.current = false;
    lastSaved.current = null;
    setHandedIn(EMPTY);
  }, [roundNumber]);

  // Work in progress, saved every few seconds while drawing.
  useEffect(() => {
    if (!checkpointMs || phase !== "DRAWING" || endsAt === null) return;
    const id = window.setInterval(() => {
      const drawing = latest.current;
      if (!touched.current || drawing === lastSaved.current || serverNow() >= endsAt) return;
      save(roundNumber, drawing, false).then(
        () => (lastSaved.current = drawing),
        () => {}, // the next checkpoint or the hand-in tries again
      );
    }, checkpointMs);
    return () => window.clearInterval(id);
  }, [checkpointMs, phase, endsAt, roundNumber, save, serverNow]);

  // The hand-in: at the deadline on the server clock, or when the server already moved to TIME_UP.
  // Retries outlive phase changes (the server moving to TIME_UP mid-retry is expected); a new round stops them.
  const retry = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(retry.current), [roundNumber]);
  const timeUp = phase === "TIME_UP";
  useEffect(() => {
    if (!roundNumber || (phase !== "DRAWING" && phase !== "TIME_UP")) return;
    const handIn = () => {
      if (handedInRound.current === roundNumber) return;
      handedInRound.current = roundNumber;
      if (!touched.current) return;
      const drawing = latest.current;
      setHandedIn(drawing);
      const giveUpAt = (endsAt ?? serverNow()) + SUBMIT_GRACE_MS + RETRY_SLACK_MS;
      const attempt = () =>
        save(roundNumber, drawing, true).then(
          () => (lastSaved.current = drawing),
          () => {
            if (serverNow() < giveUpAt) retry.current = window.setTimeout(attempt, RETRY_EVERY_MS);
          },
        );
      void attempt();
    };
    if (timeUp || endsAt === null) {
      handIn();
      return;
    }
    const timer = window.setTimeout(handIn, Math.max(0, endsAt - serverNow()));
    return () => window.clearTimeout(timer);
  }, [roundNumber, phase, timeUp, endsAt, save, serverNow]);

  const onDrawingChange = useCallback((d: Drawing) => {
    touched.current = true;
    latest.current = d;
  }, []);

  return {
    onDrawingChange,
    /** What to show as "your drawing": the stored one if the server has it, else what was handed in. */
    shown: handedIn.strokes.length > 0 ? handedIn : serverCopy || handedIn,
    /** The saved drawing to continue from after a refresh mid-round. */
    resumeFrom: serverCopy,
  };
}
