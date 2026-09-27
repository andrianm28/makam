import { describe, expect, it } from "vitest";
import { slug } from "./slug";

/** The id a heading's own words make, which is what a shared link to it uses. */
describe("slug", () => {
  it("reads a heading's words as one id", () => {
    expect(slug("Harga di halaman sama dengan Tagihan")).toBe("harga-di-halaman-sama-dengan-tagihan");
    expect(slug("Apa yang dibayar, dan kapan?")).toBe("apa-yang-dibayar-dan-kapan");
  });

  it("never starts or ends with a dash, whatever the text is", () => {
    expect(slug("Izin TPU gratis")).toBe("izin-tpu-gratis");
    for (const text of ["", "  ", "…", "FAQ", "P?", "— a —"]) {
      expect(slug(text), text).toMatch(/^[a-z0-9-]*$/);
      expect(slug(text), text).not.toMatch(/^-|-$/);
    }
  });
});
