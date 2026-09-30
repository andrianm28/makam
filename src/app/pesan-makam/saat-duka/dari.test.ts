import { describe, expect, it } from "vitest";
import { dariDari } from "./dari";

describe("the dari of a Tolak link", () => {
  it("keeps a Nomor Pemesanan and treats anything else as an ordinary visit", () => {
    expect(dariDari("MKM-2026-000123")).toBe("MKM-2026-000123");
    expect(dariDari("")).toBe("");
    expect(dariDari("../../etc/passwd")).toBe("");
    expect(dariDari("MKM 2026&x=1")).toBe("");
    expect(dariDari("A".repeat(41))).toBe("");
  });
});
