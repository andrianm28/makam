/**
 * The answer to an alternative, rendered (ticket 24's AC 2, and the review's HARD
 * 2): one tap on the **real** all-in total — and, when the offer can no longer be
 * priced, **no number at all**.
 *
 * This screen is locked because of what a zero means here. `Rp 0` is not "we
 * cannot price this"; to a family burying someone it is a free burial, and it
 * sits on a page that then offers two buttons, one of which the module refuses.
 * So the only honest answer is no figure and a person to ask — and the assertion
 * is `not.toContain("Rp 0")` rather than a check on which branch ran, because the
 * failure it guards against is a number appearing at all.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("./actions", () => ({
  jawabAlternatifAction: async () => ({ status: "gagal" as const, message: "" }),
  batalkanPesananAction: async () => ({ status: "gagal" as const, message: "" }),
}));

const { AlternatifForm } = await import("./keluar-pesanan");

/** The CS contact a page hands a client screen, as Pengaturan Operator reads it. */
const cs = { whatsApp: "+6281234567890", replyHours: "dibalas mulai pukul 06:00" };

/** The offer as the order page hands it over, at the price `quote()` gives it. */
function layarDenganHarga(): string {
  return renderToStaticMarkup(
    createElement(AlternatifForm, {
      nomor: "MKM-2026-000123",
      jenisMakam: "Khana 3 × 3 m",
      pemakamanLabel: "Jumat, 2 Oktober 2026 09:00",
      total: 8_650_000,
      lines: [
        { label: "Harga Hak Pakai – Khana 3 × 3 m", amount: 6_500_000 },
        { label: "Biaya Pemakaman", amount: 2_000_000 },
        { label: "Biaya Layanan Platform", amount: 150_000 },
      ],
      csContact: cs,
    }),
  );
}

/** The same offer, priced by nothing: what the family is shown when `quote()` cannot answer. */
function layarTanpaHarga(): string {
  return renderToStaticMarkup(
    createElement(AlternatifForm, {
      nomor: "MKM-2026-000123",
      jenisMakam: "Khana 3 × 3 m",
      pemakamanLabel: null,
      total: null,
      lines: [],
      csContact: cs,
    }),
  );
}

describe("the family answering an alternative on its all-in total", () => {
  it("puts the total and the lines behind it on the same screen, and offers both answers", () => {
    const html = layarDenganHarga();

    expect(html).toContain("Total semua biaya");
    expect(html).toContain("Rp 8.650.000");
    expect(html).toContain("Harga Hak Pakai – Khana 3 × 3 m");
    expect(html).toContain("Terima pilihan ini");
    expect(html).toContain("Tolak pilihan ini");
  });

  it("shows no number at all when the offer can no longer be priced, and never a free burial", () => {
    const html = layarTanpaHarga();

    // The whole point: no figure, so no figure can be read as "free".
    expect(html).not.toContain("Rp 0");
    expect(html).not.toMatch(/Rp\s*0\b/);
    expect(html).not.toContain("Total semua biaya");
    // It still says what the Lokasi proposed, so the family is not left guessing.
    expect(html).toContain("Khana 3 × 3 m");
    // And it sends the family to a person, because this is a dead end nobody should sit in.
    expect(html).toMatch(/CS|kami/i);
  });

  it("offers no accept button while there is no total, because accepting would only be refused", () => {
    const html = layarTanpaHarga();

    expect(html).not.toContain("Terima pilihan ini");
  });
});
