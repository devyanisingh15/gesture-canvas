import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
const { submitDrawing } = await import("./supabaseGameState");

const drawing = { strokes: [{ id: "s", points: [{ x: 0.1, y: 0.2, timestamp: 1 }] }] };
const returns = (result: { data: unknown; error: unknown }) => rpc.mockReturnValue({ abortSignal: () => Promise.resolve(result) });

describe("submitDrawing", () => {
  it("hands the drawing to submit_drawing and returns when the database stored it", async () => {
    returns({ data: "2026-10-11T12:00:45.500Z", error: null });
    await expect(submitDrawing("r1", drawing)).resolves.toBe(Date.parse("2026-10-11T12:00:45.500Z"));
    expect(rpc).toHaveBeenCalledWith("submit_drawing", { p_round_id: "r1", p_strokes: { version: 1, strokes: drawing.strokes } });
  });

  it("reports a drawing that arrived after the deadline as closed, not as a retryable failure", async () => {
    returns({ data: null, error: { code: "GC010", message: "Time's up: this round no longer takes drawings" } });
    await expect(submitDrawing("r1", drawing)).rejects.toMatchObject({ kind: "closed", retryable: false });
  });

  it("lets a network failure be retried", async () => {
    returns({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expect(submitDrawing("r1", drawing)).rejects.toMatchObject({ kind: "network", retryable: true });
  });
});
