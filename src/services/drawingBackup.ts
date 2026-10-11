/**
 * Keeps the drawing in progress on this device (localStorage), so a refresh or
 * a dropped connection before the round ends doesn't lose it. Nothing here
 * goes to the server; the drawing is handed in once, when the round ends.
 */
import { parseDrawing, serializeDrawing } from "@/features/drawing/serialization";
import type { Drawing } from "@/features/drawing/types";

const PREFIX = "gesture-canvas:drawing:";

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

/** Removes every saved drawing except `keep` (older rounds and games). */
export function clearDrawingBackups(keep?: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && key !== keep) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved either.
  }
}
