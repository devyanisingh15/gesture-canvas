/**
 * Keeps the drawing in progress on this device (localStorage), so a refresh or
 * a dropped connection before the round ends doesn't lose it. Nothing here
 * goes to the server; the drawing is handed in once, when the round ends.
 */
import { parseDrawing, serializeDrawing } from "@/features/drawing/serialization";
import type { Drawing } from "@/features/drawing/types";

const PREFIX = "gesture-canvas:drawing:";
/** Appended to a drawing's key for the mark saying which tab is drawing it. */
const OWNER_SUFFIX = ":tab";

/** One player's drawing for one round of one game. */
export const drawingBackupKey = (gameId: string, roundNumber: number, playerId: string) => `${PREFIX}${gameId}:${roundNumber}:${playerId}`;

export function saveDrawingBackup(key: string, drawing: Drawing): void {
  try {
    localStorage.setItem(key, serializeDrawing(drawing));
  } catch {
    // Storage full or blocked (private mode): the drawing still gets handed in from memory.
  }
}

export function loadDrawingBackup(key: string): Drawing | null {
  try {
    const json = localStorage.getItem(key);
    return json ? parseDrawing(json) : null;
  } catch {
    return null;
  }
}

/** Removes every saved drawing except `keep` and which tab is drawing it (older rounds and games). */
export function clearDrawingBackups(keep?: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && key !== keep && key !== keep + OWNER_SUFFIX) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

/** Removes one saved drawing (the server has it now), keeping which tab drew it so other tabs still stand back. */
export function removeDrawingBackup(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was saved either.
  }
}

/*
 * Which tab is drawing. The same player can have the game open in two tabs
 * (or a stale tab left behind); both see the round, but only the tab the
 * player actually draws in should hand the drawing in. That tab marks the
 * round's drawing as its own and keeps the mark fresh while it is open.
 */
/** A mark older than this belongs to a tab that is gone (closed, crashed or frozen). */
export const DRAWING_TAB_STALE_MS = 3_000;

export const thisTabId: string =
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random()}`;

/** Marks the drawing under `key` as this tab's, as of now. */
export function claimDrawing(key: string, tabId = thisTabId, now = Date.now()): void {
  try {
    localStorage.setItem(key + OWNER_SUFFIX, JSON.stringify({ tab: tabId, at: now }));
  } catch {
    // Storage blocked: each tab is on its own, as before.
  }
}

/** Drops this tab's mark (the page is going away), so another open tab hands the drawing in. */
export function releaseDrawing(key: string, tabId = thisTabId): void {
  try {
    if (drawingTab(key)?.tab === tabId) localStorage.removeItem(key + OWNER_SUFFIX);
  } catch {
    // Storage blocked: nothing was marked.
  }
}

function drawingTab(key: string): { tab: string; at: number } | null {
  try {
    const mark = JSON.parse(localStorage.getItem(key + OWNER_SUFFIX) ?? "null");
    return mark && typeof mark.tab === "string" && typeof mark.at === "number" ? mark : null;
  } catch {
    return null;
  }
}

/** Whether another tab that is still open is the one drawing under `key`. */
export function drawnInAnotherTab(key: string, tabId = thisTabId, now = Date.now()): boolean {
  const mark = drawingTab(key);
  return mark !== null && mark.tab !== tabId && now - mark.at < DRAWING_TAB_STALE_MS;
}
