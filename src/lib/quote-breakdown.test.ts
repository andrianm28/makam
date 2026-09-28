import { describe, expect, it } from "vitest";
import type { AllInPrice, QuotedLine } from "@/domain/tariffs";
import { allInBreakdown } from "./quote-breakdown";

const lokasi = { provider: { kind: "lokasi_mitra", lokasiId: "l" } } as const;
const operator = { provider: { kind: "operator" } } as const;
const base = { inForceSince: "2026-10-01", scheduledChange: null } as const;

/** Amounts here are plain numbers: this helper only reads and formats them, so the Rupiah brand adds nothing to the test. */
const line = (value: object) => value as unknown as QuotedLine;

describe("an all-in price's parts, in one line", () => {
  it("joins every line's label and amount with ' + '", () => {
    const price: AllInPrice = {
      total: 8_750_000,
      inForceSince: "2026-10-01",
      scheduledChange: null,
      lines: [
        line({
          ...base,
          ...lokasi,
          kind: "harga_hak_pakai",
          jenisMakamId: "j",
          jenisMakamName: "Makam Standar",
          tenure: { kind: "tahun", years: 20 },
          amount: 8_500_000,
        }),
        line({ ...base, ...operator, kind: "biaya_layanan_platform", amount: 250_000 }),
      ],
    };

    expect(allInBreakdown(price)).toBe("Harga Hak Pakai – Makam Standar Rp 8.500.000 + Biaya Layanan Platform Rp 250.000");
  });

  it("is the bare amount when there is only one line", () => {
    const price: AllInPrice = {
      total: 1_500_000,
      inForceSince: "2026-10-01",
      scheduledChange: null,
      lines: [line({ ...base, ...lokasi, kind: "biaya_pemakaman", lokasiId: "l", tumpang: false, amount: 1_500_000 })],
    };

    expect(allInBreakdown(price)).toBe("Biaya Pemakaman Rp 1.500.000");
  });
});
