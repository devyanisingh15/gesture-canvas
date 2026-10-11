"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentRound } from "@/features/game/engine/stateMachine";
import type { Drawing, Game } from "@/features/game/engine/types";
import { SUBMIT_GRACE_MS } from "@/features/game/state";
import {
  claimDrawing,
  clearDrawingBackups,
  drawingBackupKey,
  drawnInAnotherTab,
  loadDrawingBackup,
  releaseDrawing,
  removeDrawingBackup,
  saveDrawingBackup,
} from "@/services/drawingBackup";

const EMPTY: Drawing = { strokes: [] };
/** How long to keep retrying a hand-in the server hasn't answered, past the point it would still accept it. */
const RETRY_SLACK_MS = 2_000;
const RETRY_EVERY_MS = 1_000;
/** How often the drawing in progress is copied to this device's storage while it changes. */
const BACKUP_EVERY_MS = 500;
/** How often a tab that is drawing renews its claim on the round's drawing (see claimDrawing). */
const CLAIM_EVERY_MS = 1_000;

export interface DrawingSaver {
  /**
   * Stores this player's drawing for a round on the server. Resolves "closed"
   * when the server won't take it any more (its deadline has passed); rejects
   * when it couldn't be reached, to be retried.
   */
  save: (roundNumber: number, drawing: Drawing, final: boolean) => Promise<"saved" | "closed">;
  /** The server's clock (ms). */
  serverNow: () => number;
}

/**
 * This player's drawing for the current round. It lives above the drawing
 * screen so it survives that screen unmounting. While drawing it stays on this
 * device (a copy in localStorage survives a refresh or reconnect); it is
 * serialized and handed in once, the moment the round's server deadline passes
 * (or the server says time is up), and retried until the server takes it or
 * refuses it as too late.
 *
 * With the game open in more than one tab, the tab the player draws in hands
 * the drawing in; the others stand back while that tab is open, so a stale tab
 * can't hand in an older (or empty) drawing first.
 */
export function useRoundDrawing(game: Game | null, meId: string | undefined, { save, serverNow }: DrawingSaver) {
  const round = game ? currentRound(game) : undefined;
  const roundNumber = round?.number ?? 0;
  const endsAt = round?.drawingEndsAt ?? null;
  const phase = game?.phase;
  const serverCopy = (meId && round?.drawings[meId]?.drawing) || null;

  const latest = useRef<Drawing>(EMPTY);
  // Whether this tab drew (or resumed) this round; a tab that only saw the end must not overwrite the saved drawing.
  const touched = useRef(false);
  // Whether the player changed the drawing in this tab this round (not just opened it).
  const edited = useRef(false);
  const lastSaved = useRef<Drawing | null>(null);
  const handedInRound = useRef(0);
  const [handedIn, setHandedIn] = useState<Drawing>(EMPTY);

  // This round's copy on this device, if this browser was drawing it before a refresh or reconnect.
  // Read during render so the drawing screen starts from it on its first mount.
  const backupKey = game && meId && roundNumber ? drawingBackupKey(game.id, roundNumber, meId) : null;
  const backup = useMemo(() => (backupKey ? loadDrawingBackup(backupKey) : null), [backupKey]);
  useEffect(() => {
    if (!backupKey) return; // game not loaded yet
    latest.current = backup ?? EMPTY;
    touched.current = backup !== null;
    edited.current = false;
    lastSaved.current = null;
    setHandedIn(EMPTY);
    clearDrawingBackups(backupKey); // earlier rounds and games
  }, [backupKey, backup]);

  // Copies the drawing to this device's storage a couple of times a second while it changes, and when the page goes away.
  // Stops once the drawing is handed in.
  const backupTimer = useRef<number | undefined>(undefined);
  const writeBackup = useCallback(() => {
    window.clearTimeout(backupTimer.current);
    backupTimer.current = undefined;
    if (backupKey && edited.current && handedInRound.current !== roundNumber) saveDrawingBackup(backupKey, latest.current);
  }, [backupKey, roundNumber]);
  useEffect(() => {
    const onPageHide = () => {
      writeBackup();
      if (backupKey && edited.current) releaseDrawing(backupKey); // another open tab hands it in now
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      writeBackup();
    };
  }, [writeBackup, backupKey]);

  // The tab being drawn in keeps its claim fresh for the rest of the round.
  useEffect(() => {
    if (!backupKey) return;
    const timer = window.setInterval(() => {
      if (edited.current) claimDrawing(backupKey);
    }, CLAIM_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [backupKey]);

  // The hand-in: at the deadline on the server clock, or when the server already moved to TIME_UP.
  // Retries outlive phase changes (the server moving to TIME_UP mid-retry is expected); a new round stops them.
  const retry = useRef<number | undefined>(undefined);
  // A hand-in waiting to be retried goes the moment the browser is back online, not at the next retry tick.
  const retryNow = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      window.clearTimeout(retry.current);
      retryNow.current = null;
    },
    [roundNumber],
  );
  useEffect(() => {
    const onOnline = () => retryNow.current?.();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  const timeUp = phase === "TIME_UP";
  useEffect(() => {
    if (!roundNumber || (phase !== "DRAWING" && phase !== "TIME_UP")) return;
    const giveUpAt = (endsAt ?? serverNow()) + SUBMIT_GRACE_MS + RETRY_SLACK_MS;
    const handIn = () => {
      if (handedInRound.current === roundNumber) return;
      if (!edited.current && backupKey && drawnInAnotherTab(backupKey)) {
        // The player is drawing in another tab, which hands it in. Look again in case that tab goes away first.
        window.clearTimeout(retry.current);
        if (serverNow() < giveUpAt) retry.current = window.setTimeout(handIn, RETRY_EVERY_MS);
        return;
      }
      handedInRound.current = roundNumber;
      if (!touched.current) return;
      // A tab the player didn't draw in hands in the freshest copy on this device (another tab may have drawn it).
      const drawing = (!edited.current && backupKey && loadDrawingBackup(backupKey)) || latest.current;
      setHandedIn(drawing);
      const attempt = () => {
        retryNow.current = null;
        window.clearTimeout(retry.current);
        return save(roundNumber, drawing, true).then(
          () => {
            lastSaved.current = drawing;
            if (backupKey) removeDrawingBackup(backupKey); // the server has it now
          },
          () => {
            if (serverNow() >= giveUpAt) return;
            retry.current = window.setTimeout(attempt, RETRY_EVERY_MS);
            retryNow.current = () => void attempt();
          },
        );
      };
      void attempt();
    };
    if (timeUp || endsAt === null) {
      handIn();
      return;
    }
    const timer = window.setTimeout(handIn, Math.max(0, endsAt - serverNow()));
    return () => window.clearTimeout(timer);
  }, [roundNumber, phase, timeUp, endsAt, save, serverNow, backupKey]);

  const onDrawingChange = useCallback(
    (d: Drawing, initial?: boolean) => {
      touched.current = true;
      latest.current = d;
      if (initial) return; // the drawing screen opening, not the player drawing
      if (!edited.current && backupKey) claimDrawing(backupKey);
      edited.current = true;
      backupTimer.current ??= window.setTimeout(writeBackup, BACKUP_EVERY_MS);
    },
    [writeBackup, backupKey],
  );

  return {
    onDrawingChange,
    /** What to show as "your drawing": the stored one if the server has it, else what was handed in. */
    shown: handedIn.strokes.length > 0 ? handedIn : serverCopy || handedIn,
    /** The drawing to continue from after a refresh or reconnect mid-round: this device's copy, else the server's. */
    resumeFrom: backup ?? serverCopy,
  };
}
