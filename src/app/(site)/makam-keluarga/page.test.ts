import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The hub's own metadata (spec, Public site: a page a family reads without
 * signing in). The lookup is a plain GET form, so the question — and the Almarhum
 * name in it — travels in the address of a page that also answers "where is it":
 * it must never be indexed, exactly like the other ten pages of family data here.
 */
describe("the Makam keluarga hub page's own metadata", () => {
  it("is never indexed, and is still followed from the links that lead to it", async () => {
    const { metadata } = await import("./page");

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it.each([
    ["the hub", "src/app/(site)/makam-keluarga/page.tsx"],
    ["Akun Saya", "src/app/(site)/akun/page.tsx"],
    ["a Pemesanan order", "src/app/(site)/pesanan/[nomor]/page.tsx"],
    ["a Tagihan document", "src/app/dokumen/[link]/page.tsx"],
  ])("%s says the same thing in its own source, so the flag cannot be lost one page at a time", (_halaman, file) => {
    // Read as text, so a page that puts its `robots` in a `generateMetadata` the import above
    // cannot see is still checked: what matters is that the rule is written down per page.
    const source = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
    expect(source, `${file} must say it is not indexed`).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});
