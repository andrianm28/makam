import { describe, expect, it } from "vitest";
import { galatHalaman, isStaleActionByName } from "./galat-halaman";

describe("halaman galat", () => {
  it("a stale Server Action (the site was updated) asks the visitor to reload the form and is not reported", () => {
    const page = galatHalaman(true);
    expect(page.kind).toBe("diperbarui");
    expect(page.heading).toContain("Halaman diperbarui");
    expect(page.body).toMatch(/diperbarui/);
    expect(page.report).toBe(false);
    expect(page.showBeranda).toBe(false);
  });

  it("any other error shows 'Terjadi kesalahan' with Muat ulang and Beranda, and is reported", () => {
    const page = galatHalaman(false);
    expect(page.kind).toBe("umum");
    expect(page.heading).toBe("Terjadi kesalahan");
    expect(page.report).toBe(true);
    expect(page.showBeranda).toBe(true);
  });

  it("recognises an UnrecognizedActionError by name when Next's own check is unavailable", () => {
    const error = new Error("Server action not found.");
    error.name = "UnrecognizedActionError";
    expect(isStaleActionByName(error)).toBe(true);
    expect(isStaleActionByName(new Error("boom"))).toBe(false);
    expect(isStaleActionByName("string")).toBe(false);
  });
});
