import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
const { submitDrawing } = await import("./supabaseGameState");

const T = 1_760_000_000_000;
const drawing = {
  strokes: [
    { id: "s", points: [{ x: 0.123456, y: 0.2, timestamp: T + 0.4 }, { x: 0.3, y: 0.4, timestamp: T + 33 }] },
    { id: "dot", points: [{ x: 0.5, y: 0.5, timestamp: T + 50 }] },
  ],
};
const returns = (result: { data: unknown; error: unknown }) => rpc.mockReturnValue({ abortSignal: () => Promise.resolve(result) });

describe("submitDrawing", () => {
  it("hands a shaped, checked drawing to submit_drawing and returns when the database stored it", async () => {
    returns({ data: "2026-10-11T12:00:45.500Z", error: null });
    await expect(submitDrawing("r1", drawing, 45)).resolves.toBe(Date.parse("2026-10-11T12:00:45.500Z"));
    expect(rpc).toHaveBeenCalledWith("submit_drawing", {
      p_round_id: "r1",
      // No player or game id is sent: the database works those out from the signed-in user.
      p_strokes: { version: 1, strokes: [{ id: "s", points: [{ x: 0.1235, y: 0.2, timestamp: T }, { x: 0.3, y: 0.4, timestamp: T + 33 }] }] },
    });
  });

  it("never sends a drawing that fails the checks", async () => {
    rpc.mockClear();
    const bad = { strokes: [{ id: "s", points: [{ x: 0.1, y: 0.2, timestamp: 5 }, { x: 0.3, y: 0.4, timestamp: 6 }] }] };
    await expect(submitDrawing("r1", bad, 45)).rejects.toMatchObject({ kind: "invalid-drawing", retryable: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a drawing that arrived after the deadline as closed, not as a retryable failure", async () => {
    returns({ data: null, error: { code: "GC010", message: "Time's up: this round no longer takes drawings" } });
    await expect(submitDrawing("r1", drawing, 45)).rejects.toMatchObject({ kind: "closed", retryable: false });
  });

  it("reports a second, different hand-in and a refused payload", async () => {
    returns({ data: null, error: { code: "GC011", message: "already handed in" } });
    await expect(submitDrawing("r1", drawing, 45)).rejects.toMatchObject({ kind: "already-submitted", retryable: false });
    returns({ data: null, error: { code: "GC012", message: "Invalid drawing: bad color" } });
    await expect(submitDrawing("r1", drawing, 45)).rejects.toMatchObject({ kind: "invalid-drawing", retryable: false });
  });

  it("lets a network failure be retried", async () => {
    returns({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expect(submitDrawing("r1", drawing, 45)).rejects.toMatchObject({ kind: "network", retryable: true });
  });
});
