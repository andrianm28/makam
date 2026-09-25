import { describe, expect, it } from "vitest";
import { SystemClock } from "@/adapters/live/system-clock";
import { FakeClock } from "@/adapters/memory/fake-clock";
import { formatWib, wib } from "@/lib/time/jakarta";

describe("Clock", () => {
  it("the fake Clock starts at the time it is given and can be set", () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    expect(formatWib(clock.now())).toBe("01/10/2026 09.00.00 WIB");

    clock.set(wib("2026-10-02 23:30"));
    expect(formatWib(clock.now())).toBe("02/10/2026 23.30.00 WIB");
  });

  it("the fake Clock advances by days, hours, minutes and seconds", () => {
    const clock = new FakeClock(wib("2026-10-01 22:00"));
    clock.advance({ hours: 3 });
    expect(formatWib(clock.now())).toBe("02/10/2026 01.00.00 WIB");

    clock.advance({ days: 3, minutes: 1, seconds: 30 });
    expect(formatWib(clock.now())).toBe("05/10/2026 01.01.30 WIB");
  });

  it("returns a copy, so a caller cannot move the fake Clock by mutating the Date", () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    clock.now().setFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it("the system Clock reads real time", () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now - before).toBeLessThan(1_000);
  });
});

describe("Asia/Jakarta time", () => {
  it("reads wall-clock times as WIB (UTC+7), whatever the host time zone", () => {
    expect(wib("2026-10-01 07:00").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(wib("2026-10-01").toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("rejects a malformed wall-clock time", () => {
    expect(() => wib("1 Oktober 2026")).toThrow();
  });
});
