import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWING_TAB_STALE_MS,
  claimDrawing,
  clearDrawingBackups,
  drawingBackupKey,
  drawnInAnotherTab,
  loadDrawingBackup,
  releaseDrawing,
  removeDrawingBackup,
  saveDrawingBackup,
} from "./drawingBackup";

class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, v);
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
}

const key = drawingBackupKey("game", 2, "ana");
const drawing = { strokes: [{ id: "s1", points: [{ x: 0.1, y: 0.2, timestamp: 1 }, { x: 0.3, y: 0.4, timestamp: 2 }] }] };

beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("which tab is drawing", () => {
  it("another tab stands back while the drawing tab is open", () => {
    claimDrawing(key, "tab-a", 1_000);
    expect(drawnInAnotherTab(key, "tab-b", 1_500)).toBe(true);
    expect(drawnInAnotherTab(key, "tab-a", 1_500)).toBe(false);
  });

  it("nobody stands back when no tab has drawn", () => {
    expect(drawnInAnotherTab(key, "tab-b", 1_000)).toBe(false);
  });

  it("a claim that stopped being renewed belongs to a tab that is gone", () => {
    claimDrawing(key, "tab-a", 1_000);
    expect(drawnInAnotherTab(key, "tab-b", 1_000 + DRAWING_TAB_STALE_MS)).toBe(false);
  });

  it("closing the drawing tab releases its claim, but not someone else's", () => {
    claimDrawing(key, "tab-a", 1_000);
    releaseDrawing(key, "tab-b");
    expect(drawnInAnotherTab(key, "tab-b", 1_100)).toBe(true);
    releaseDrawing(key, "tab-a");
    expect(drawnInAnotherTab(key, "tab-b", 1_100)).toBe(false);
  });

  it("a garbled claim is ignored", () => {
    localStorage.setItem(`${key}:tab`, "{not json");
    expect(drawnInAnotherTab(key, "tab-b", 1_000)).toBe(false);
  });
});

describe("saved drawings", () => {
  it("clearing older rounds keeps this round's drawing and its claim", () => {
    const old = drawingBackupKey("game", 1, "ana");
    saveDrawingBackup(old, drawing);
    claimDrawing(old, "tab-a", 1_000);
    saveDrawingBackup(key, drawing);
    claimDrawing(key, "tab-a", 1_000);
    clearDrawingBackups(key);
    expect(loadDrawingBackup(old)).toBeNull();
    expect(drawnInAnotherTab(old, "tab-b", 1_100)).toBe(false);
    expect(loadDrawingBackup(key)).toEqual(drawing);
    expect(drawnInAnotherTab(key, "tab-b", 1_100)).toBe(true);
  });

  it("removing a handed-in drawing keeps the claim, so other tabs don't hand in a stale copy", () => {
    saveDrawingBackup(key, drawing);
    claimDrawing(key, "tab-a", 1_000);
    removeDrawingBackup(key);
    expect(loadDrawingBackup(key)).toBeNull();
    expect(drawnInAnotherTab(key, "tab-b", 1_100)).toBe(true);
  });
});
