import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { getSession: vi.fn(), signInAnonymously: vi.fn() };
const rpc = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth, rpc }),
}));

const { createGame, GameRequestError } = await import("./supabaseGames");

function rpcReturns(result: { data: unknown; error: unknown }) {
  rpc.mockReturnValue({ abortSignal: () => Promise.resolve(result) });
}

const ROW = { game_id: "g1", player_id: "p1", room_code: "ABC234" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
});

describe("createGame", () => {
  it("calls create_game and returns the new session", async () => {
    rpcReturns({ data: [ROW], error: null });
    await expect(createGame({ displayName: "  Maya ", totalRounds: 5 })).resolves.toEqual({ gameId: "g1", playerId: "p1", roomCode: "ABC234" });
    expect(rpc).toHaveBeenCalledWith("create_game", { p_display_name: "Maya", p_total_rounds: 5 });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously first when there is no session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInAnonymously.mockResolvedValue({ error: null });
    rpcReturns({ data: [ROW], error: null });
    await createGame({ displayName: "Maya", totalRounds: 5 });
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("explains how to enable anonymous sign-ins when they are off", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInAnonymously.mockResolvedValue({ error: { message: "Anonymous sign-ins are disabled" } });
    const err = await createGame({ displayName: "Maya", totalRounds: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GameRequestError);
    expect(err).toMatchObject({ kind: "setup", retryable: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "22023", message: "Names must be 1-16 characters" }, "invalid", false],
    [{ code: "PGRST202", message: "Could not find the function" }, "setup", false],
    [{ code: "42501", message: "permission denied" }, "auth", false],
    [{ code: "", message: "TypeError: Failed to fetch" }, "network", true],
    [{ code: "XX000", message: "boom" }, "unknown", true],
  ])("maps %o to a %s error", async (error, kind, retryable) => {
    rpcReturns({ data: null, error });
    await expect(createGame({ displayName: "Maya", totalRounds: 5 })).rejects.toMatchObject({ kind, retryable });
  });

  it("treats a timeout as a retryable network error", async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })) });
    await expect(createGame({ displayName: "Maya", totalRounds: 5 })).rejects.toMatchObject({ kind: "network", retryable: true });
  });
});
