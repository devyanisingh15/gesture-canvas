import { describe, expect, it } from "vitest";
import { msUntilNextSecond, secondsLeft, ServerClock } from "./clock";

describe("ServerClock", () => {
  it("is the local clock until it has a sample", () => {
    const clock = new ServerClock(() => 1_000);
    expect(clock.offset).toBe(0);
    expect(clock.now()).toBe(1_000);
  });

  it("uses the midpoint of the request", () => {
    const clock = new ServerClock(() => 10_000);
    // Local clock is 30 s behind; the request took 200 ms.
    clock.add({ sentAt: 0, receivedAt: 200, serverTime: 30_100 });
    expect(clock.offset).toBe(30_000);
    expect(clock.now()).toBe(40_000);
  });

  it("prefers the fastest round trip", () => {
    const clock = new ServerClock();
    clock.add({ sentAt: 0, receivedAt: 2_000, serverTime: 5_000 }); // slow: offset 4 000, ±1 s
    clock.add({ sentAt: 3_000, receivedAt: 3_040, serverTime: 3_520 }); // fast: offset 500
    clock.add({ sentAt: 4_000, receivedAt: 4_900, serverTime: 5_100 }); // slow again
    expect(clock.offset).toBe(500);
  });

  it("forgets old samples, so a changed local clock is picked up", () => {
    const clock = new ServerClock();
    clock.add({ sentAt: 0, receivedAt: 10, serverTime: 5 }); // fast, offset 0
    for (let i = 1; i <= 8; i++) clock.add({ sentAt: i * 1000, receivedAt: i * 1000 + 50, serverTime: i * 1000 + 60_025 });
    expect(clock.offset).toBe(60_000);
  });

  it("ignores impossible samples", () => {
    const clock = new ServerClock();
    clock.add({ sentAt: 100, receivedAt: 50, serverTime: 9_999 });
    clock.add({ sentAt: 0, receivedAt: 10, serverTime: NaN });
    expect(clock.offset).toBe(0);
  });
});

describe("secondsLeft", () => {
  const end = 100_000;
  it("counts whole seconds down to 1, then 0", () => {
    expect(secondsLeft(end, end - 45_000)).toBe(45);
    expect(secondsLeft(end, end - 44_999)).toBe(45);
    expect(secondsLeft(end, end - 44_000)).toBe(44);
    expect(secondsLeft(end, end - 1)).toBe(1);
    expect(secondsLeft(end, end)).toBe(0);
    expect(secondsLeft(end, end + 5_000)).toBe(0);
    expect(secondsLeft(null, end)).toBe(0);
  });

  it("knows when the count next changes", () => {
    expect(msUntilNextSecond(end, end - 45_000)).toBe(1_000);
    expect(msUntilNextSecond(end, end - 44_250)).toBe(250);
    expect(msUntilNextSecond(end, end - 1)).toBe(1);
    expect(msUntilNextSecond(end, end)).toBeNull();
    expect(msUntilNextSecond(null, end)).toBeNull();
  });
});
