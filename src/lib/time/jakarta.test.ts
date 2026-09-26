import { describe, expect, it } from "vitest";
import { formatTanggal, formatTanggalJam, formatWib, wib, wibDateOf } from "./jakarta";

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

describe("Indonesian dates", () => {
  it("a WIB calendar date reads '1 November 2026'", () => {
    expect(formatTanggal("2026-11-01")).toBe("1 November 2026");
    expect(formatTanggal("2027-01-20")).toBe("20 Januari 2027");
  });

  it("an instant reads as its WIB date and time: '1 Oktober 2026, 21.00 WIB'", () => {
    expect(formatTanggalJam(wib("2026-10-01 21:00"))).toBe("1 Oktober 2026, 21.00 WIB");
    expect(formatTanggalJam(new Date("2026-12-31T17:05:00Z"))).toBe("1 Januari 2027, 00.05 WIB");
  });
});
