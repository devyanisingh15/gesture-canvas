import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { getSession: vi.fn(), signInAnonymously: vi.fn() };
const rpc = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth, rpc }),
}));

const { createGame, joinGame, normalizeRoomCode, GameRequestError } = await import("./supabaseGames");

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
    await expect(createGame({ displayName: "  Maya ", totalRounds: 5, drawSeconds: 45 })).resolves.toEqual({ gameId: "g1", playerId: "p1", roomCode: "ABC234" });
    expect(rpc).toHaveBeenCalledWith("create_game", { p_display_name: "Maya", p_total_rounds: 5, p_draw_seconds: 45 });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously first when there is no session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInAnonymously.mockResolvedValue({ error: null });
    rpcReturns({ data: [ROW], error: null });
    await createGame({ displayName: "Maya", totalRounds: 5, drawSeconds: 45 });
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("explains how to enable anonymous sign-ins when they are off", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.signInAnonymously.mockResolvedValue({ error: { message: "Anonymous sign-ins are disabled" } });
    const err = await createGame({ displayName: "Maya", totalRounds: 5, drawSeconds: 45 }).catch((e: unknown) => e);
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
    await expect(createGame({ displayName: "Maya", totalRounds: 5, drawSeconds: 45 })).rejects.toMatchObject({ kind, retryable });
  });

  it("treats a timeout as a retryable network error", async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })) });
    await expect(createGame({ displayName: "Maya", totalRounds: 5, drawSeconds: 45 })).rejects.toMatchObject({ kind: "network", retryable: true });
  });
});

describe("normalizeRoomCode", () => {
  it.each([
    ["  px7k2q ", "PX7K2Q"],
    ["PX7K2Q", "PX7K2Q"],
    ["PX7K2", null],
    ["PX7K2QQ", null],
    ["PX7K0Q", null],
    ["PX-K2Q", null],
  ])("%j → %j", (input, want) => expect(normalizeRoomCode(input)).toBe(want));
});

describe("joinGame", () => {
  it("sends the normalized code and returns the seat", async () => {
    rpcReturns({ data: [{ game_id: "g1", player_id: "p2", room_code: "PX7K2Q" }], error: null });
    await expect(joinGame({ roomCode: " px7k2q", displayName: " Ben " })).resolves.toEqual({ gameId: "g1", playerId: "p2", roomCode: "PX7K2Q" });
    expect(rpc).toHaveBeenCalledWith("join_game", { p_room_code: "PX7K2Q", p_display_name: "Ben" });
  });

  it("rejects a malformed code without a request", async () => {
    await expect(joinGame({ roomCode: "abc", displayName: "Ben" })).rejects.toMatchObject({ kind: "invalid-code" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["GC001", "not-found", /couldn't find a game/i],
    ["GC002", "started", /already started/i],
    ["GC003", "full", /full/i],
    ["GC004", "name-taken", /already has that name/i],
    ["22023", "invalid-code", /valid room code/i],
  ])("maps %s to %s", async (code, kind, message) => {
    rpcReturns({ data: null, error: { code, message: code === "22023" ? "That isn't a valid room code" : "x" } });
    const err = await joinGame({ roomCode: "PX7K2Q", displayName: "Ben" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind, retryable: false });
    expect((err as Error).message).toMatch(message);
  });

  it("offers a retry on a network failure", async () => {
    rpcReturns({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expect(joinGame({ roomCode: "PX7K2Q", displayName: "Ben" })).rejects.toMatchObject({ kind: "network", retryable: true });
  });
});
