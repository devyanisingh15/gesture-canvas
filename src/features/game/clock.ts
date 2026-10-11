/**
 * The server's clock, as seen from this browser. Countdowns and deadlines use
 * it instead of the local clock, which can be off by seconds or minutes.
 *
 * Each response that carries the server's time is a sample. The offset is
 * taken from the sample with the shortest round trip, since its midpoint is
 * the best guess of when the server read its clock.
 */
export interface ClockSample {
  /** Local time just before the request was sent (ms). */
  sentAt: number;
  /** Local time just after the response arrived (ms). */
  receivedAt: number;
  /** The server's time in the response (ms). */
  serverTime: number;
}

/** How many recent samples to choose from. Old ones go, so a changed local clock is picked up. */
const KEEP_SAMPLES = 8;

export class ServerClock {
  private samples: { offset: number; rtt: number }[] = [];

  constructor(private readonly localNow: () => number = () => Date.now()) {}

  add({ sentAt, receivedAt, serverTime }: ClockSample): void {
    if (!Number.isFinite(serverTime) || receivedAt < sentAt) return;
    this.samples.push({ offset: serverTime - (sentAt + receivedAt) / 2, rtt: receivedAt - sentAt });
    if (this.samples.length > KEEP_SAMPLES) this.samples.shift();
  }

  /** Server time minus local time (ms); 0 before the first sample. */
  get offset(): number {
    let best: { offset: number; rtt: number } | undefined;
    for (const s of this.samples) if (!best || s.rtt <= best.rtt) best = s;
    return best?.offset ?? 0;
  }

  /** Now, on the server's clock (ms). */
  now = (): number => this.localNow() + this.offset;
}

/** Whole seconds left until a deadline: 45, 44, … 1, then 0 ("time's up"). */
export function secondsLeft(endsAt: number | null, now: number): number {
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Milliseconds until the displayed whole-second count next changes, or null once it reaches 0. */
export function msUntilNextSecond(endsAt: number | null, now: number): number | null {
  if (endsAt === null || now >= endsAt) return null;
  const left = endsAt - now;
  return left % 1000 || 1000;
}
