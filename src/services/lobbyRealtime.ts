"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { touchSeat, type GameSession } from "./supabaseGames";

/**
 * The live side of a Supabase lobby: one private Realtime channel per game,
 * topic `game:<game id>` (members only, enforced by RLS on realtime.messages).
 *
 * - Presence says who has the lobby open right now. Each tab tracks its player id.
 * - A tiny "lobby" broadcast tells the others to re-read the lobby after a
 *   join, leave or start. It carries no game data: everyone re-reads through RLS.
 * - A heartbeat every 20 s stamps players.last_seen_at with the database clock,
 *   which start_game uses to count active players.
 *
 * Nothing per-frame (video, hand landmarks, strokes) goes over this channel.
 */

export type LobbyLinkStatus = "connecting" | "live" | "reconnecting";

export interface LobbyLinkHandlers {
  /** Something about the lobby changed (a player joined, left, or the game started): re-read it. */
  onChange: () => void;
  /** Player ids with the lobby open right now. */
  onPresence: (online: ReadonlySet<string>) => void;
  onStatus: (status: LobbyLinkStatus) => void;
  /** The heartbeat found this player has no seat any more (left in another tab, or removed). */
  onSeatLost?: () => void;
}

export interface LobbyLink {
  /** Tells everyone else to re-read the lobby. */
  notify: () => Promise<void>;
  /** Stops presence and the heartbeat, then closes the channel. Safe to call twice. */
  close: () => Promise<void>;
}

const HEARTBEAT_MS = 20_000;
const LOBBY_EVENT = "lobby";

/** Channels still closing, per topic: a new link for the same game waits for these. */
const closing = new Map<string, Promise<void>>();

export function openLobbyLink(session: GameSession, handlers: LobbyLinkHandlers): LobbyLink {
  const topic = `game:${session.gameId}`;
  const supabase = getSupabaseBrowserClient();
  let channel: RealtimeChannel | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const beat = () => {
    touchSeat(session.gameId).catch((err: unknown) => {
      if (!closed && err instanceof Error && "kind" in err && err.kind === "not-member") handlers.onSeatLost?.();
    });
  };

  const open = async () => {
    // The channel of a previous link to this game (e.g. React remounting) must be gone first,
    // or supabase-js would hand back that half-closed channel.
    await closing.get(topic);
    if (closed) return;
    // Private channels authorize with the signed-in user's token.
    await supabase.realtime.setAuth();
    if (closed) return;

    handlers.onStatus("connecting");
    const ch = supabase.channel(topic, {
      config: { private: true, presence: { key: session.playerId }, broadcast: { self: false } },
    });
    channel = ch;
    ch.on("presence", { event: "sync" }, () => {
      if (!closed) handlers.onPresence(new Set(Object.keys(ch.presenceState())));
    })
      .on("presence", { event: "join" }, () => !closed && handlers.onChange())
      .on("presence", { event: "leave" }, () => !closed && handlers.onChange())
      .on("broadcast", { event: LOBBY_EVENT }, () => !closed && handlers.onChange())
      .subscribe((status) => {
        if (closed) return;
        if (status === "SUBSCRIBED") {
          // Also runs after every automatic rejoin: announce ourselves again and catch up.
          handlers.onStatus("live");
          void ch.track({ player_id: session.playerId });
          handlers.onChange();
          beat();
        } else {
          // CHANNEL_ERROR, TIMED_OUT or CLOSED while we still want the channel:
          // supabase-js keeps retrying the join with backoff.
          handlers.onStatus("reconnecting");
        }
      });
    heartbeat = setInterval(beat, HEARTBEAT_MS);
  };

  const opened = open().catch(() => handlers.onStatus("reconnecting"));

  let closingThis: Promise<void> | null = null;
  const close = () => {
    if (closingThis) return closingThis;
    closed = true;
    closingThis = opened.then(async () => {
      if (heartbeat) clearInterval(heartbeat);
      if (!channel) return;
      try {
        await channel.untrack();
      } catch {
        // Not tracked, or already disconnected.
      }
      await supabase.removeChannel(channel);
      channel = null;
    });
    closing.set(topic, closingThis);
    void closingThis.finally(() => {
      if (closing.get(topic) === closingThis) closing.delete(topic);
    });
    return closingThis;
  };

  const notify = async () => {
    await opened;
    if (closed || !channel) return;
    await channel.send({ type: "broadcast", event: LOBBY_EVENT, payload: {} });
  };

  return { notify, close };
}
