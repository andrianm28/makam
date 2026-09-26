import { describe, expect, it } from "vitest";
import { formatWib, wib, wibDateOf } from "./jakarta";

describe("WIB time", () => {
  it("the WIB calendar date of an instant: 23:30 UTC is already the next day in Jakarta", () => {
    expect(wibDateOf(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01");
    expect(wibDateOf(new Date("2026-09-30T16:59:59Z"))).toBe("2026-09-30");
    expect(wibDateOf(wib("2026-10-01"))).toBe("2026-10-01");
  });

  it("formats an instant as a WIB date and time", () => {
    expect(formatWib(wib("2026-10-01 09:00"))).toBe("01/10/2026 09.00.00 WIB");
  });
});
