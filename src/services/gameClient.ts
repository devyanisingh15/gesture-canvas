import type { GameSettings, GameState, JoinInput } from "@/features/game/engine/types";
import type { ClientCommand, ErrorResponse, PlayerSession, SessionResponse } from "@/features/game/protocol";

export type LiveStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface LiveHandlers {
  onState: (state: GameState) => void;
  onStatus?: (status: LiveStatus) => void;
  /** The server rejected the session (e.g. the game is gone). */
  onError?: (error: GameClientError) => void;
}

/**
 * Everything the UI needs from a game backend. HttpGameClient talks to the
 * in-memory Next.js API; a Supabase client would implement the same interface
 * (RPC calls for commands, Realtime for subscribe).
 */
export interface GameClient {
  createGame(host: JoinInput, settings?: Partial<GameSettings>): Promise<SessionResponse>;
  joinGame(code: string, player: JoinInput): Promise<SessionResponse>;
  getState(code: string): Promise<GameState>;
  send(session: PlayerSession, command: ClientCommand): Promise<GameState>;
  subscribe(session: PlayerSession, handlers: LiveHandlers): () => void;
}

export class GameClientError extends Error {
  constructor(
    readonly code: ErrorResponse["error"]["code"],
    message: string,
  ) {
    super(message);
    this.name = "GameClientError";
  }
}

export class HttpGameClient implements GameClient {
  constructor(private readonly baseUrl = "/api/games") {}

  createGame(host: JoinInput, settings?: Partial<GameSettings>) {
    return this.post<SessionResponse>(this.baseUrl, { host, settings });
  }

  joinGame(code: string, player: JoinInput) {
    return this.post<SessionResponse>(`${this.baseUrl}/${encodeURIComponent(code)}/join`, { player });
  }

  async getState(code: string) {
    return this.request<GameState>(`${this.baseUrl}/${encodeURIComponent(code)}`, { method: "GET" });
  }

  send(session: PlayerSession, command: ClientCommand) {
    return this.post<GameState>(`${this.baseUrl}/${encodeURIComponent(session.code)}/commands`, {
      playerId: session.playerId,
      token: session.token,
      command,
    });
  }

  subscribe(session: PlayerSession, { onState, onStatus, onError }: LiveHandlers): () => void {
    const query = new URLSearchParams({ playerId: session.playerId, token: session.token });
    const url = `${this.baseUrl}/${encodeURIComponent(session.code)}/events?${query}`;
    let source: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      onStatus?.("connecting");
      source = new EventSource(url);
      source.addEventListener("open", () => onStatus?.("open"));
      source.addEventListener("state", (e) => onState(JSON.parse((e as MessageEvent<string>).data) as GameState));
      source.addEventListener("error", () => {
        if (stopped) return;
        // EventSource retries by itself unless the server refused the stream
        // (an error status closes it). Find out why, then retry or give up.
        if (source?.readyState === EventSource.CLOSED) {
          onStatus?.("reconnecting");
          void probe(url).then((error) => {
            if (stopped) return;
            if (error) {
              onStatus?.("closed");
              onError?.(error);
            } else {
              retry = setTimeout(() => !stopped && open(), 1500);
            }
          });
        } else {
          onStatus?.("reconnecting");
        }
      });
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
    };
  }

  private post<T>(url: string, body: unknown) {
    return this.request<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, cache: "no-store" });
    } catch {
      throw new GameClientError("NETWORK", "Can't reach the game server. Check your connection.");
    }
    const body = (await response.json().catch(() => null)) as T | ErrorResponse | null;
    if (!response.ok) {
      const error = (body as ErrorResponse | null)?.error;
      throw new GameClientError(error?.code ?? "NETWORK", error?.message ?? "Something went wrong.");
    }
    return body as T;
  }
}

/** Checks why a stream closed: returns the server's error if it refused us, or null if it's worth retrying. */
async function probe(url: string): Promise<GameClientError | null> {
  const abort = new AbortController();
  try {
    const response = await fetch(url, { signal: abort.signal, cache: "no-store" });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as ErrorResponse | null;
    return body?.error ? new GameClientError(body.error.code, body.error.message) : null;
  } catch {
    return null;
  } finally {
    abort.abort();
  }
}

let client: GameClient | null = null;

/** The app's game client. Swap the implementation here to change backends. */
export function getGameClient(): GameClient {
  client ??= new HttpGameClient();
  return client;
}

// ---------------------------------------------------------------------------
// Sessions: one per room, per browser tab, so two tabs can be two players.

const sessionKey = (code: string) => `gesture-canvas:session:${code.toUpperCase()}`;

export function saveSession(session: PlayerSession): void {
  try {
    sessionStorage.setItem(sessionKey(session.code), JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private mode); the session then lasts until reload.
  }
}

export function loadSession(code: string): PlayerSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(code));
    const s = raw ? (JSON.parse(raw) as PlayerSession) : null;
    return s && typeof s.playerId === "string" && typeof s.token === "string" ? s : null;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  try {
    sessionStorage.removeItem(sessionKey(code));
  } catch {
    // ignore
  }
}
